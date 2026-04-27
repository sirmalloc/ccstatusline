import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import { getClaudeConfigDir } from './claude-settings';
import type {
    UsageData,
    UsageError
} from './usage-types';
import { UsageErrorSchema } from './usage-types';

// Cache configuration
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_FILE = path.join(CACHE_DIR, 'usage.json');
const LOCK_FILE = path.join(CACHE_DIR, 'usage.lock');
const CACHE_MAX_AGE = 180; // seconds
const LOCK_MAX_AGE = 30;   // rate limit: only try API once per 30 seconds
const DEFAULT_RATE_LIMIT_BACKOFF = 300; // seconds
const MACOS_USAGE_CREDENTIALS_SERVICE = 'Claude Code-credentials';
const MACOS_SECURITY_DUMP_MAX_BUFFER = 8 * 1024 * 1024;

const UsageCredentialsSchema = z.object({ claudeAiOauth: z.object({ accessToken: z.string().nullable().optional() }).optional() });
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

function parseUsageAccessToken(rawJson: string): string | null {
    const parsed = parseJsonWithSchema(rawJson, UsageCredentialsSchema);
    return parsed?.claudeAiOauth?.accessToken ?? null;
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

// Memory caches
let cachedUsageData: UsageData | null = null;
let usageCacheTime = 0;
let usageErrorCacheMaxAge = LOCK_MAX_AGE;

type UsageLockError = z.infer<typeof UsageLockErrorSchema>;

type UsageApiFetchResult = { kind: 'success'; body: string } | { kind: 'rate-limited'; retryAfterSeconds: number } | { kind: 'error' };
interface MacKeychainCredentialCandidate {
    modifiedAt: string | null;
    order: number;
    service: string;
}

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

function getStaleUsageOrError(error: UsageError, now: number, errorCacheMaxAge = LOCK_MAX_AGE): UsageData {
    const stale = readStaleUsageCache();
    if (stale && !stale.error) {
        return cacheUsageData(stale, now);
    }
    return setCachedUsageError(error, now, errorCacheMaxAge);
}

function normalizeSecurityTimedateValue(rawValue: string): string | null {
    const cleaned = rawValue.replace(/\\000/g, '').replace(/\0/g, '').trim();
    return /^\d{14}Z$/.test(cleaned) ? cleaned : null;
}

function decodeHexAscii(rawHex: string): string | null {
    if (rawHex.length === 0 || rawHex.length % 2 !== 0) {
        return null;
    }

    let decoded = '';

    for (let i = 0; i < rawHex.length; i += 2) {
        const byte = Number.parseInt(rawHex.slice(i, i + 2), 16);
        if (Number.isNaN(byte)) {
            return null;
        }

        decoded += String.fromCharCode(byte);
    }

    return decoded;
}

function parseModifiedTimeFromKeychainBlock(block: string): string | null {
    const quotedMatch = /"mdat"<timedate>=(?:0x[0-9A-Fa-f]+\s+)?"([^"]+)"/.exec(block);
    if (quotedMatch?.[1]) {
        const parsed = normalizeSecurityTimedateValue(quotedMatch[1]);
        if (parsed !== null) {
            return parsed;
        }
    }

    const hexMatch = /"mdat"<timedate>=0x([0-9A-Fa-f]+)/.exec(block);
    if (!hexMatch?.[1]) {
        return null;
    }

    const decoded = decodeHexAscii(hexMatch[1]);
    return decoded ? normalizeSecurityTimedateValue(decoded) : null;
}

function sortMacKeychainCredentialCandidates(a: MacKeychainCredentialCandidate, b: MacKeychainCredentialCandidate): number {
    if (a.modifiedAt !== null && b.modifiedAt !== null && a.modifiedAt !== b.modifiedAt) {
        return b.modifiedAt.localeCompare(a.modifiedAt);
    }

    if (a.modifiedAt !== null && b.modifiedAt === null) {
        return -1;
    }

    if (a.modifiedAt === null && b.modifiedAt !== null) {
        return 1;
    }

    return a.order - b.order;
}

export function parseMacKeychainCredentialCandidates(rawDump: string, servicePrefix = MACOS_USAGE_CREDENTIALS_SERVICE): string[] {
    const blocks = rawDump.split(/(?=^keychain:\s)/m).filter(block => block.trim().length > 0);
    const dedupedCandidates = new Map<string, MacKeychainCredentialCandidate>();
    let order = 0;

    for (const block of blocks) {
        const serviceMatch = /"svce"<blob>="([^"]+)"/.exec(block);
        const service = serviceMatch?.[1];

        if (!service || !service.startsWith(servicePrefix) || service === MACOS_USAGE_CREDENTIALS_SERVICE) {
            continue;
        }

        const candidate: MacKeychainCredentialCandidate = {
            modifiedAt: parseModifiedTimeFromKeychainBlock(block),
            order,
            service
        };
        order += 1;

        const existing = dedupedCandidates.get(service);
        if (!existing || sortMacKeychainCredentialCandidates(candidate, existing) < 0) {
            dedupedCandidates.set(service, candidate);
        }
    }

    return [...dedupedCandidates.values()]
        .sort(sortMacKeychainCredentialCandidates)
        .map(candidate => candidate.service);
}

function readMacKeychainSecret(service: string): string | null {
    try {
        return execFileSync(
            'security',
            ['find-generic-password', '-s', service, '-w'],
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        ).trim();
    } catch {
        return null;
    }
}

function readUsageTokenFromMacKeychainService(service: string): string | null {
    const secret = readMacKeychainSecret(service);
    return secret ? parseUsageAccessToken(secret) : null;
}

function listMacKeychainCredentialCandidates(): string[] {
    try {
        const rawDump = execFileSync(
            'security',
            ['dump-keychain'],
            {
                encoding: 'utf8',
                maxBuffer: MACOS_SECURITY_DUMP_MAX_BUFFER,
                stdio: ['pipe', 'pipe', 'ignore']
            }
        );

        return parseMacKeychainCredentialCandidates(rawDump);
    } catch {
        return [];
    }
}

function readUsageTokenFromMacKeychainCandidates(): string | null {
    const candidates = listMacKeychainCredentialCandidates();

    for (const service of candidates) {
        const token = readUsageTokenFromMacKeychainService(service);
        if (token) {
            return token;
        }
    }

    return null;
}

function readUsageTokenFromCredentialsFile(): string | null {
    try {
        const credFile = path.join(getClaudeConfigDir(), '.credentials.json');
        return parseUsageAccessToken(fs.readFileSync(credFile, 'utf8'));
    } catch {
        return null;
    }
}

export function getUsageToken(): string | null {
    if (process.platform !== 'darwin') {
        return readUsageTokenFromCredentialsFile();
    }

    return readUsageTokenFromMacKeychainService(MACOS_USAGE_CREDENTIALS_SERVICE)
        ?? readUsageTokenFromMacKeychainCandidates()
        ?? readUsageTokenFromCredentialsFile();
}

function readStaleUsageCache(): UsageData | null {
    try {
        return parseCachedUsageData(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function writeUsageLock(blockedUntil: number, error: UsageLockError): void {
    try {
        ensureCacheDirExists();
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ blockedUntil, error }));
    } catch {
        // Ignore lock file errors
    }
}

function readActiveUsageLock(now: number): { blockedUntil: number; error: UsageLockError } | null {
    let hasValidJsonLock = false;

    try {
        const parsed = parseJsonWithSchema(fs.readFileSync(LOCK_FILE, 'utf8'), UsageLockSchema);
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
        const lockStat = fs.statSync(LOCK_FILE);
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

export async function fetchUsageData(): Promise<UsageData> {
    const now = Math.floor(Date.now() / 1000);

    // Check memory cache (fast path)
    if (cachedUsageData) {
        const cacheAge = now - usageCacheTime;
        if (!cachedUsageData.error && cacheAge < CACHE_MAX_AGE) {
            return cachedUsageData;
        }
        if (cachedUsageData.error && cacheAge < usageErrorCacheMaxAge) {
            return cachedUsageData;
        }
    }

    // Check file cache
    try {
        const stat = fs.statSync(CACHE_FILE);
        const fileAge = now - Math.floor(stat.mtimeMs / 1000);
        if (fileAge < CACHE_MAX_AGE) {
            const fileData = parseCachedUsageData(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (fileData && !fileData.error) {
                return cacheUsageData(fileData, now);
            }
        }
    } catch {
        // File doesn't exist or read error - continue to API call
    }

    // Get token before lock/rate-limit checks so auth failures are not masked as timeout.
    const token = getUsageToken();
    if (!token) {
        return getStaleUsageOrError('no-credentials', now);
    }

    const activeLock = readActiveUsageLock(now);
    if (activeLock) {
        return getStaleUsageOrError(
            activeLock.error,
            now,
            Math.max(1, activeLock.blockedUntil - now)
        );
    }

    writeUsageLock(now + LOCK_MAX_AGE, 'timeout');

    // Fetch from API using Node's https module
    try {
        const response = await fetchFromUsageApi(token);

        if (response.kind === 'rate-limited') {
            writeUsageLock(now + response.retryAfterSeconds, 'rate-limited');
            return getStaleUsageOrError('rate-limited', now, response.retryAfterSeconds);
        }

        if (response.kind === 'error') {
            return getStaleUsageOrError('api-error', now);
        }

        const usageData = parseUsageApiResponse(response.body);
        if (!usageData) {
            return getStaleUsageOrError('parse-error', now);
        }

        // Validate we got actual data
        if (usageData.sessionUsage === undefined && usageData.weeklyUsage === undefined) {
            return getStaleUsageOrError('parse-error', now);
        }

        // Save to cache
        try {
            ensureCacheDirExists();
            fs.writeFileSync(CACHE_FILE, JSON.stringify(usageData));
        } catch {
            // Ignore cache write errors
        }

        return cacheUsageData(usageData, now);
    } catch {
        return getStaleUsageOrError('parse-error', now);
    }
}
