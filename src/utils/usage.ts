import {
    execSync,
    spawnSync
} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import type { BlockMetrics } from '../types';

import { getClaudeConfigDir } from './claude-settings';
import { getCachedBlockMetrics } from './jsonl';

// Cache configuration
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_FILE = path.join(CACHE_DIR, 'usage.json');
const LOCK_FILE = path.join(CACHE_DIR, 'usage.lock');
const CACHE_MAX_AGE = 180; // seconds
const LOCK_MAX_AGE = 30;   // rate limit: only try API once per 30 seconds
const TOKEN_CACHE_MAX_AGE = 3600; // 1 hour
export const FIVE_HOUR_BLOCK_MS = 5 * 60 * 60 * 1000;
export const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Error types matching shell script
const UsageErrorSchema = z.enum(['no-credentials', 'timeout', 'api-error', 'parse-error']);
export type UsageError = z.infer<typeof UsageErrorSchema>;

export interface UsageData {
    sessionUsage?: number;  // five_hour.utilization (percentage)
    sessionResetAt?: string; // five_hour.resets_at
    weeklyUsage?: number;   // seven_day.utilization (percentage)
    weeklyResetAt?: string; // seven_day.resets_at
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;      // in cents
    extraUsageUsed?: number;       // in cents
    extraUsageUtilization?: number;
    error?: UsageError;
}

export interface UsageWindowMetrics {
    sessionDurationMs: number;
    elapsedMs: number;
    remainingMs: number;
    elapsedPercent: number;
    remainingPercent: number;
}

const UsageCredentialsSchema = z.object({ claudeAiOauth: z.object({ accessToken: z.string().nullable().optional() }).optional() });

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
let cachedUsageToken: string | null = null;
let usageTokenCacheTime = 0;

function setCachedUsageError(error: UsageError, now: number): UsageData {
    const errorData: UsageData = { error };
    cachedUsageData = errorData;
    usageCacheTime = now;
    return errorData;
}

function getStaleUsageOrError(error: UsageError, now: number): UsageData {
    const stale = readStaleUsageCache();
    if (stale && !stale.error) {
        cachedUsageData = stale;
        usageCacheTime = now;
        return stale;
    }
    return setCachedUsageError(error, now);
}

function getUsageToken(): string | null {
    const now = Math.floor(Date.now() / 1000);

    // Return cached token if still valid
    if (cachedUsageToken && (now - usageTokenCacheTime) < TOKEN_CACHE_MAX_AGE) {
        return cachedUsageToken;
    }

    try {
        const isMac = process.platform === 'darwin';
        if (isMac) {
            // macOS: read from keychain
            const result = execSync(
                'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
                { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim();
            const token = parseUsageAccessToken(result);
            if (token) {
                cachedUsageToken = token;
                usageTokenCacheTime = now;
            }
            return token;
        }

        // Non-macOS: read from credentials file, honoring CLAUDE_CONFIG_DIR
        const credFile = path.join(getClaudeConfigDir(), '.credentials.json');
        const token = parseUsageAccessToken(fs.readFileSync(credFile, 'utf8'));
        if (token) {
            cachedUsageToken = token;
            usageTokenCacheTime = now;
        }
        return token;
    } catch {
        return null;
    }
}

function readStaleUsageCache(): UsageData | null {
    try {
        return parseCachedUsageData(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function fetchFromUsageApi(token: string): string | null {
    // Use the active runtime to make a synchronous API call via spawnSync.
    const script = `
        const token = process.env.TOKEN;
        if (!token) {
            process.exit(1);
        }

        const https = require('https');
        const options = {
            hostname: 'api.anthropic.com',
            path: '/api/oauth/usage',
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'anthropic-beta': 'oauth-2025-04-20'
            },
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 && data) {
                    process.stdout.write(data);
                } else {
                    process.exit(1);
                }
            });
        });

        req.on('error', () => process.exit(1));
        req.on('timeout', () => {
            req.destroy();
            process.exit(1);
        });
        req.end();
    `;

    const runtimePath = process.execPath || 'node';
    const result = spawnSync(runtimePath, ['-e', script], {
        encoding: 'utf8',
        timeout: 6000,
        env: { ...process.env, TOKEN: token }
    });

    if (result.error || result.status !== 0 || !result.stdout) {
        return null;
    }

    return result.stdout;
}

export function fetchUsageData(): UsageData {
    const now = Math.floor(Date.now() / 1000);

    // Check memory cache (fast path)
    if (cachedUsageData) {
        const cacheAge = now - usageCacheTime;
        if (!cachedUsageData.error && cacheAge < CACHE_MAX_AGE) {
            return cachedUsageData;
        }
        if (cachedUsageData.error && cacheAge < LOCK_MAX_AGE) {
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
                cachedUsageData = fileData;
                usageCacheTime = now;
                return fileData;
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

    // Rate limit: only try API once per 30 seconds
    try {
        const lockStat = fs.statSync(LOCK_FILE);
        const lockAge = now - Math.floor(lockStat.mtimeMs / 1000);
        if (lockAge < LOCK_MAX_AGE) {
            // Rate limited - return stale cache or timeout error
            const stale = readStaleUsageCache();
            if (stale && !stale.error)
                return stale;
            return { error: 'timeout' };
        }
    } catch {
        // Lock file doesn't exist - OK to proceed
    }

    // Touch lock file
    try {
        const lockDir = path.dirname(LOCK_FILE);
        if (!fs.existsSync(lockDir)) {
            fs.mkdirSync(lockDir, { recursive: true });
        }
        fs.writeFileSync(LOCK_FILE, '');
    } catch {
        // Ignore lock file errors
    }

    // Fetch from API using Node's https module
    try {
        const response = fetchFromUsageApi(token);

        if (!response) {
            return getStaleUsageOrError('api-error', now);
        }

        const usageData = parseUsageApiResponse(response);
        if (!usageData) {
            return getStaleUsageOrError('parse-error', now);
        }

        // Validate we got actual data
        if (usageData.sessionUsage === undefined && usageData.weeklyUsage === undefined) {
            return getStaleUsageOrError('parse-error', now);
        }

        // Save to cache
        try {
            if (!fs.existsSync(CACHE_DIR)) {
                fs.mkdirSync(CACHE_DIR, { recursive: true });
            }
            fs.writeFileSync(CACHE_FILE, JSON.stringify(usageData));
        } catch {
            // Ignore cache write errors
        }

        cachedUsageData = usageData;
        usageCacheTime = now;
        return usageData;
    } catch {
        return getStaleUsageOrError('parse-error', now);
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function buildUsageWindow(resetAtMs: number, nowMs: number, durationMs: number): UsageWindowMetrics | null {
    if (!Number.isFinite(resetAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
        return null;
    }

    const startAtMs = resetAtMs - durationMs;
    const elapsedMs = clamp(nowMs - startAtMs, 0, durationMs);
    const remainingMs = durationMs - elapsedMs;
    const elapsedPercent = (elapsedMs / durationMs) * 100;

    return {
        sessionDurationMs: durationMs,
        elapsedMs,
        remainingMs,
        elapsedPercent,
        remainingPercent: 100 - elapsedPercent
    };
}

export function getUsageWindowFromResetAt(sessionResetAt: string | undefined, nowMs = Date.now()): UsageWindowMetrics | null {
    if (!sessionResetAt) {
        return null;
    }

    const resetAtMs = Date.parse(sessionResetAt);
    if (Number.isNaN(resetAtMs)) {
        return null;
    }

    return buildUsageWindow(resetAtMs, nowMs, FIVE_HOUR_BLOCK_MS);
}

export function getUsageWindowFromBlockMetrics(blockMetrics: BlockMetrics, nowMs = Date.now()): UsageWindowMetrics | null {
    const startAtMs = blockMetrics.startTime.getTime();
    if (Number.isNaN(startAtMs)) {
        return null;
    }

    return buildUsageWindow(startAtMs + FIVE_HOUR_BLOCK_MS, nowMs, FIVE_HOUR_BLOCK_MS);
}

export function resolveUsageWindowWithFallback(
    usageData: UsageData,
    blockMetrics?: BlockMetrics | null,
    nowMs = Date.now()
): UsageWindowMetrics | null {
    const usageWindow = getUsageWindowFromResetAt(usageData.sessionResetAt, nowMs);
    if (usageWindow) {
        return usageWindow;
    }

    const fallbackMetrics = blockMetrics ?? getCachedBlockMetrics();
    if (!fallbackMetrics) {
        return null;
    }

    return getUsageWindowFromBlockMetrics(fallbackMetrics, nowMs);
}

export function getWeeklyUsageWindowFromResetAt(weeklyResetAt: string | undefined, nowMs = Date.now()): UsageWindowMetrics | null {
    if (!weeklyResetAt) {
        return null;
    }

    const resetAtMs = Date.parse(weeklyResetAt);
    if (Number.isNaN(resetAtMs)) {
        return null;
    }

    return buildUsageWindow(resetAtMs, nowMs, SEVEN_DAY_WINDOW_MS);
}

export function resolveWeeklyUsageWindow(usageData: UsageData, nowMs = Date.now()): UsageWindowMetrics | null {
    return getWeeklyUsageWindowFromResetAt(usageData.weeklyResetAt, nowMs);
}

export function formatUsageDuration(durationMs: number): string {
    const clampedMs = Math.max(0, durationMs);
    const elapsedHours = Math.floor(clampedMs / (1000 * 60 * 60));
    const elapsedMinutes = Math.floor((clampedMs % (1000 * 60 * 60)) / (1000 * 60));

    if (elapsedMinutes === 0) {
        return `${elapsedHours}hr`;
    }

    return `${elapsedHours}hr ${elapsedMinutes}m`;
}

export function getUsageErrorMessage(error: UsageError): string {
    switch (error) {
    case 'no-credentials': return '[No credentials]';
    case 'timeout': return '[Timeout]';
    case 'api-error': return '[API Error]';
    case 'parse-error': return '[Parse Error]';
    }
}

export function makeUsageProgressBar(percent: number, width = 15): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}