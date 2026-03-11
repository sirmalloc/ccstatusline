import * as fs from 'fs';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import { getOAuthToken, oauthTokenHash } from './credentials';
import type { SessionAccount } from './session-affinity';
import type {
    UsageData,
    UsageError
} from './usage-types';
import { UsageErrorSchema } from './usage-types';

// Cache configuration
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_MAX_AGE = 180; // seconds

function getUsageCacheFile(hash: string): string {
    return path.join(CACHE_DIR, `usage-${hash}.json`);
}

function getUsageLockFile(hash: string): string {
    return path.join(CACHE_DIR, `usage-${hash}.lock`);
}
const LOCK_MAX_AGE = 30;   // rate limit: only try API once per 30 seconds
const DEFAULT_RATE_LIMIT_BACKOFF = 300; // seconds
const UsageLockErrorSchema = z.enum(['timeout', 'rate-limited']);
const UsageLockSchema = z.object({
    blockedUntil: z.number(),
    error: UsageLockErrorSchema.optional()
});

const CachedUsageDataSchema = z.object({
    sessionUsage: z.number().nullable().optional(),
    sessionResetAt: z.string().nullable().optional(),
    weeklyUsage: z.number().nullable().optional(),
    weeklyResetAt: z.string().nullable().optional(),
    extraUsageEnabled: z.boolean().nullable().optional(),
    extraUsageLimit: z.number().nullable().optional(),
    extraUsageUsed: z.number().nullable().optional(),
    extraUsageUtilization: z.number().nullable().optional(),
    error: z.string().nullable().optional()
});

const UsageApiResponseSchema = z.object({
    five_hour: z.object({
        utilization: z.number().nullable().optional(),
        resets_at: z.string().nullable().optional()
    }).optional(),
    seven_day: z.object({
        utilization: z.number().nullable().optional(),
        resets_at: z.string().nullable().optional()
    }).optional(),
    extra_usage: z.object({
        is_enabled: z.boolean().nullable().optional(),
        monthly_limit: z.number().nullable().optional(),
        used_credits: z.number().nullable().optional(),
        utilization: z.number().nullable().optional()
    }).optional()
});

function parseJsonWithSchema<T>(rawJson: string, schema: z.ZodType<T>): T | null {
    try {
        const parsed = schema.safeParse(JSON.parse(rawJson));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseCachedUsageData(rawJson: string): UsageData | null {
    const parsed = parseJsonWithSchema(rawJson, CachedUsageDataSchema);
    if (!parsed) {
        return null;
    }

    const parsedError = UsageErrorSchema.safeParse(parsed.error);

    return {
        sessionUsage: parsed.sessionUsage ?? undefined,
        sessionResetAt: parsed.sessionResetAt ?? undefined,
        weeklyUsage: parsed.weeklyUsage ?? undefined,
        weeklyResetAt: parsed.weeklyResetAt ?? undefined,
        extraUsageEnabled: parsed.extraUsageEnabled ?? undefined,
        extraUsageLimit: parsed.extraUsageLimit ?? undefined,
        extraUsageUsed: parsed.extraUsageUsed ?? undefined,
        extraUsageUtilization: parsed.extraUsageUtilization ?? undefined,
        error: parsedError.success ? parsedError.data : undefined
    };
}

function parseUsageApiResponse(rawJson: string): UsageData | null {
    const parsed = parseJsonWithSchema(rawJson, UsageApiResponseSchema);
    if (!parsed) {
        return null;
    }

    return {
        sessionUsage: parsed.five_hour?.utilization ?? undefined,
        sessionResetAt: parsed.five_hour?.resets_at ?? undefined,
        weeklyUsage: parsed.seven_day?.utilization ?? undefined,
        weeklyResetAt: parsed.seven_day?.resets_at ?? undefined,
        extraUsageEnabled: parsed.extra_usage?.is_enabled ?? undefined,
        extraUsageLimit: parsed.extra_usage?.monthly_limit ?? undefined,
        extraUsageUsed: parsed.extra_usage?.used_credits ?? undefined,
        extraUsageUtilization: parsed.extra_usage?.utilization ?? undefined
    };
}

// Memory caches — invalidated when token changes (different account)
let cachedUsageData: UsageData | null = null;
let usageCacheTime = 0;
let usageErrorCacheMaxAge = LOCK_MAX_AGE;
let lastUsedUsageTokenHash: string | null = null;

type UsageLockError = z.infer<typeof UsageLockErrorSchema>;

type UsageApiFetchResult = { kind: 'success'; body: string } | { kind: 'rate-limited'; retryAfterSeconds: number } | { kind: 'error' };

function ensureCacheDirExists(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function setCachedUsageError(error: UsageError, now: number, maxAge = LOCK_MAX_AGE): UsageData {
    const errorData: UsageData = { error };
    cachedUsageData = errorData;
    usageCacheTime = now;
    usageErrorCacheMaxAge = maxAge;
    return errorData;
}

function cacheUsageData(data: UsageData, now: number): UsageData {
    cachedUsageData = data;
    usageCacheTime = now;
    usageErrorCacheMaxAge = LOCK_MAX_AGE;
    return data;
}

function getStaleUsageOrError(hash: string, error: UsageError, now: number, errorCacheMaxAge = LOCK_MAX_AGE): UsageData {
    const stale = readStaleUsageCache(hash);
    if (stale && !stale.error) {
        return cacheUsageData(stale, now);
    }
    return setCachedUsageError(error, now, errorCacheMaxAge);
}

// Delegate to shared credential module which handles suffixed keychain entries
function getUsageToken(): string | null {
    return getOAuthToken();
}

function readStaleUsageCache(hash: string): UsageData | null {
    try {
        return parseCachedUsageData(fs.readFileSync(getUsageCacheFile(hash), 'utf8'));
    } catch {
        // Also try the legacy global file as fallback
        try {
            return parseCachedUsageData(fs.readFileSync(path.join(CACHE_DIR, 'usage.json'), 'utf8'));
        } catch {
            return null;
        }
    }
}

function writeUsageLock(hash: string, blockedUntil: number, error: UsageLockError): void {
    try {
        ensureCacheDirExists();
        fs.writeFileSync(getUsageLockFile(hash), JSON.stringify({ blockedUntil, error }));
    } catch {
        // Ignore lock file errors
    }
}

function readActiveUsageLock(hash: string, now: number): { blockedUntil: number; error: UsageLockError } | null {
    const lockFile = getUsageLockFile(hash);
    let hasValidJsonLock = false;

    try {
        const parsed = parseJsonWithSchema(fs.readFileSync(lockFile, 'utf8'), UsageLockSchema);
        if (parsed) {
            hasValidJsonLock = true;
            if (parsed.blockedUntil > now) {
                return {
                    blockedUntil: parsed.blockedUntil,
                    error: parsed.error ?? 'timeout'
                };
            }
            return null;
        }
    } catch {
        // Fall back to the legacy mtime-based lock behavior below.
    }

    if (hasValidJsonLock) {
        return null;
    }

    try {
        const lockStat = fs.statSync(lockFile);
        const lockMtime = Math.floor(lockStat.mtimeMs / 1000);
        const blockedUntil = lockMtime + LOCK_MAX_AGE;
        if (blockedUntil > now) {
            return {
                blockedUntil,
                error: 'timeout'
            };
        }
    } catch {
        // Lock file doesn't exist - OK to proceed
    }

    return null;
}

function parseRetryAfterSeconds(headerValue: string | string[] | undefined, nowMs = Date.now()): number | null {
    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const trimmedValue = rawValue?.trim();
    if (!trimmedValue) {
        return null;
    }

    if (/^\d+$/.test(trimmedValue)) {
        const seconds = Number.parseInt(trimmedValue, 10);
        return seconds > 0 ? seconds : null;
    }

    const retryAtMs = Date.parse(trimmedValue);
    if (Number.isNaN(retryAtMs)) {
        return null;
    }

    const retryAfterSeconds = Math.ceil((retryAtMs - nowMs) / 1000);
    return retryAfterSeconds > 0 ? retryAfterSeconds : null;
}

const USAGE_API_HOST = 'api.anthropic.com';
const USAGE_API_PATH = '/api/oauth/usage';
const USAGE_API_TIMEOUT_MS = 5000;

function getUsageApiProxyUrl(): string | null {
    const proxyUrl = process.env.HTTPS_PROXY?.trim();
    if (proxyUrl === '') {
        return null;
    }

    return proxyUrl ?? null;
}

function getUsageApiRequestOptions(token: string): https.RequestOptions | null {
    const proxyUrl = getUsageApiProxyUrl();

    try {
        return {
            hostname: USAGE_API_HOST,
            path: USAGE_API_PATH,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'anthropic-beta': 'oauth-2025-04-20'
            },
            timeout: USAGE_API_TIMEOUT_MS,
            ...(proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {})
        };
    } catch {
        return null;
    }
}

async function fetchFromUsageApi(token: string): Promise<UsageApiFetchResult> {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (value: UsageApiFetchResult) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };

        const requestOptions = getUsageApiRequestOptions(token);
        if (!requestOptions) {
            finish({ kind: 'error' });
            return;
        }

        const request = https.request(requestOptions, (response) => {
            let data = '';
            response.setEncoding('utf8');

            response.on('data', (chunk: string) => {
                data += chunk;
            });

            response.on('end', () => {
                if (response.statusCode === 200 && data) {
                    finish({ kind: 'success', body: data });
                    return;
                }

                if (response.statusCode === 429) {
                    finish({
                        kind: 'rate-limited',
                        retryAfterSeconds: parseRetryAfterSeconds(response.headers['retry-after']) ?? DEFAULT_RATE_LIMIT_BACKOFF
                    });
                    return;
                }

                finish({ kind: 'error' });
            });
        });

        request.on('error', () => { finish({ kind: 'error' }); });
        request.on('timeout', () => {
            request.destroy();
            finish({ kind: 'error' });
        });
        request.end();
    });
}

export async function fetchUsageData(session?: SessionAccount): Promise<UsageData> {
    const now = Math.floor(Date.now() / 1000);

    // Use session-pinned account if provided, otherwise fall back to current token
    let token: string | null;
    let hash: string;
    let canFetch: boolean;

    if (session) {
        token = session.token;
        hash = session.hash;
        canFetch = session.canFetch;
    } else {
        token = getUsageToken();
        hash = token ? oauthTokenHash(token) : '';
        canFetch = true;
    }

    if (!hash) {
        return setCachedUsageError('no-credentials', now);
    }

    // Invalidate memory cache if token changed (different account)
    if (lastUsedUsageTokenHash && lastUsedUsageTokenHash !== hash) {
        cachedUsageData = null;
        usageCacheTime = 0;
    }
    lastUsedUsageTokenHash = hash;

    // Re-check memory cache after potential invalidation
    if (cachedUsageData) {
        const cacheAge = now - usageCacheTime;
        if (!cachedUsageData.error && cacheAge < CACHE_MAX_AGE) {
            return cachedUsageData;
        }
        if (cachedUsageData.error && cacheAge < usageErrorCacheMaxAge) {
            return cachedUsageData;
        }
    }

    // Check per-token file cache (no age limit when we can't fetch — serve stale)
    const cacheFile = getUsageCacheFile(hash);
    try {
        const stat = fs.statSync(cacheFile);
        const fileAge = now - Math.floor(stat.mtimeMs / 1000);
        if (!canFetch || fileAge < CACHE_MAX_AGE) {
            const fileData = parseCachedUsageData(fs.readFileSync(cacheFile, 'utf8'));
            if (fileData && !fileData.error) {
                return cacheUsageData(fileData, now);
            }
        }
    } catch {
        // File doesn't exist or read error - continue to API call
    }

    // Can't make API calls — session is pinned to a different account
    if (!canFetch || !token) {
        return getStaleUsageOrError(hash, 'no-credentials', now);
    }

    const activeLock = readActiveUsageLock(hash, now);
    if (activeLock) {
        return getStaleUsageOrError(
            hash,
            activeLock.error,
            now,
            Math.max(1, activeLock.blockedUntil - now)
        );
    }

    writeUsageLock(hash, now + LOCK_MAX_AGE, 'timeout');

    // Fetch from API using Node's https module
    try {
        const response = await fetchFromUsageApi(token);

        if (response.kind === 'rate-limited') {
            writeUsageLock(hash, now + response.retryAfterSeconds, 'rate-limited');
            return getStaleUsageOrError(hash, 'rate-limited', now, response.retryAfterSeconds);
        }

        if (response.kind === 'error') {
            return getStaleUsageOrError(hash, 'api-error', now);
        }

        const usageData = parseUsageApiResponse(response.body);
        if (!usageData) {
            return getStaleUsageOrError(hash, 'parse-error', now);
        }

        // Validate we got actual data
        if (usageData.sessionUsage === undefined && usageData.weeklyUsage === undefined) {
            return getStaleUsageOrError(hash, 'parse-error', now);
        }

        // Save to per-token cache
        try {
            ensureCacheDirExists();
            fs.writeFileSync(getUsageCacheFile(hash), JSON.stringify(usageData));
        } catch {
            // Ignore cache write errors
        }

        return cacheUsageData(usageData, now);
    } catch {
        return getStaleUsageOrError(hash, 'parse-error', now);
    }
}