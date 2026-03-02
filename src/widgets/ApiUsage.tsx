import {
    execSync,
    spawnSync
} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

// Cache configuration
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_FILE = path.join(CACHE_DIR, 'usage.json');
const LOCK_FILE = path.join(CACHE_DIR, 'usage.lock');
const CACHE_MAX_AGE = 180; // seconds
const LOCK_MAX_AGE = 30;   // rate limit: only try API once per 30 seconds
const TOKEN_CACHE_MAX_AGE = 3600; // 1 hour

// Error types matching shell script
const ApiErrorSchema = z.enum(['no-credentials', 'timeout', 'api-error', 'parse-error']);
type ApiError = z.infer<typeof ApiErrorSchema>;

interface ApiData {
    sessionUsage?: number;  // five_hour.utilization (percentage)
    sessionResetAt?: string; // five_hour.reset_at
    weeklyUsage?: number;   // seven_day.utilization (percentage)
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;      // in cents
    extraUsageUsed?: number;       // in cents
    extraUsageUtilization?: number;
    error?: ApiError;
}

const CredentialsSchema = z.object({ claudeAiOauth: z.object({ accessToken: z.string().nullable().optional() }).optional() });

const CachedApiDataSchema = z.object({
    sessionUsage: z.number().nullable().optional(),
    sessionResetAt: z.string().nullable().optional(),
    weeklyUsage: z.number().nullable().optional(),
    extraUsageEnabled: z.boolean().nullable().optional(),
    extraUsageLimit: z.number().nullable().optional(),
    extraUsageUsed: z.number().nullable().optional(),
    extraUsageUtilization: z.number().nullable().optional(),
    error: z.string().nullable().optional()
});

const ApiUsageResponseSchema = z.object({
    five_hour: z.object({
        utilization: z.number().nullable().optional(),
        reset_at: z.string().nullable().optional(),
        resets_at: z.string().nullable().optional()
    }).optional(),
    seven_day: z.object({ utilization: z.number().nullable().optional() }).optional(),
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

function parseAccessToken(rawJson: string): string | null {
    const parsed = parseJsonWithSchema(rawJson, CredentialsSchema);
    return parsed?.claudeAiOauth?.accessToken ?? null;
}

function parseCachedApiData(rawJson: string): ApiData | null {
    const parsed = parseJsonWithSchema(rawJson, CachedApiDataSchema);
    if (!parsed) {
        return null;
    }

    const parsedError = ApiErrorSchema.safeParse(parsed.error);

    return {
        sessionUsage: parsed.sessionUsage ?? undefined,
        sessionResetAt: parsed.sessionResetAt ?? undefined,
        weeklyUsage: parsed.weeklyUsage ?? undefined,
        extraUsageEnabled: parsed.extraUsageEnabled ?? undefined,
        extraUsageLimit: parsed.extraUsageLimit ?? undefined,
        extraUsageUsed: parsed.extraUsageUsed ?? undefined,
        extraUsageUtilization: parsed.extraUsageUtilization ?? undefined,
        error: parsedError.success ? parsedError.data : undefined
    };
}

function parseApiUsageResponse(rawJson: string): ApiData | null {
    const parsed = parseJsonWithSchema(rawJson, ApiUsageResponseSchema);
    if (!parsed) {
        return null;
    }

    return {
        sessionUsage: parsed.five_hour?.utilization ?? undefined,
        sessionResetAt: parsed.five_hour?.resets_at ?? parsed.five_hour?.reset_at ?? undefined,
        weeklyUsage: parsed.seven_day?.utilization ?? undefined,
        extraUsageEnabled: parsed.extra_usage?.is_enabled ?? undefined,
        extraUsageLimit: parsed.extra_usage?.monthly_limit ?? undefined,
        extraUsageUsed: parsed.extra_usage?.used_credits ?? undefined,
        extraUsageUtilization: parsed.extra_usage?.utilization ?? undefined
    };
}

// Memory caches
let cachedData: ApiData | null = null;
let cacheTime = 0;
let cachedToken: string | null = null;
let tokenCacheTime = 0;

function getToken(): string | null {
    const now = Math.floor(Date.now() / 1000);

    // Return cached token if still valid
    if (cachedToken && (now - tokenCacheTime) < TOKEN_CACHE_MAX_AGE) {
        return cachedToken;
    }

    try {
        const isMac = process.platform === 'darwin';
        if (isMac) {
            // macOS: read from keychain
            const result = execSync(
                'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
                { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim();
            const token = parseAccessToken(result);
            if (token) {
                cachedToken = token;
                tokenCacheTime = now;
            }
            return token;
        } else {
            // Linux: read from credentials file
            const credFile = path.join(os.homedir(), '.claude', '.credentials.json');
            const token = parseAccessToken(fs.readFileSync(credFile, 'utf8'));
            if (token) {
                cachedToken = token;
                tokenCacheTime = now;
            }
            return token;
        }
    } catch {
        return null;
    }
}

function readStaleCache(): ApiData | null {
    try {
        return parseCachedApiData(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

// Fetch API using Node's built-in https module (no curl dependency)
function fetchFromApi(token: string): string | null {
    // Use Node to make HTTPS request synchronously via spawnSync
    const script = `
        const https = require('https');
        const options = {
            hostname: 'api.anthropic.com',
            path: '/api/oauth/usage',
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + process.env.TOKEN,
                'anthropic-beta': 'oauth-2025-04-20'
            },
            timeout: 5000
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    process.stdout.write(data);
                } else {
                    process.exit(1);
                }
            });
        });
        req.on('error', () => process.exit(1));
        req.on('timeout', () => { req.destroy(); process.exit(1); });
        req.end();
    `;

    const result = spawnSync('node', ['-e', script], {
        encoding: 'utf8',
        timeout: 6000,
        env: { ...process.env, TOKEN: token }
    });

    if (result.error || result.status !== 0 || !result.stdout) {
        return null;
    }

    return result.stdout;
}

function fetchApiData(): ApiData {
    const now = Math.floor(Date.now() / 1000);

    // Check memory cache (fast path)
    if (cachedData && !cachedData.error && (now - cacheTime) < CACHE_MAX_AGE) {
        return cachedData;
    }

    // Check file cache
    try {
        const stat = fs.statSync(CACHE_FILE);
        const fileAge = now - Math.floor(stat.mtimeMs / 1000);
        if (fileAge < CACHE_MAX_AGE) {
            const fileData = parseCachedApiData(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (fileData && !fileData.error) {
                cachedData = fileData;
                cacheTime = now;
                return fileData;
            }
        }
    } catch {
        // File doesn't exist or read error - continue to API call
    }

    // Rate limit: only try API once per 30 seconds
    try {
        const lockStat = fs.statSync(LOCK_FILE);
        const lockAge = now - Math.floor(lockStat.mtimeMs / 1000);
        if (lockAge < LOCK_MAX_AGE) {
            // Rate limited - return stale cache or timeout error
            const stale = readStaleCache();
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

    // Get token
    const token = getToken();
    if (!token) {
        const stale = readStaleCache();
        if (stale && !stale.error)
            return stale;
        return { error: 'no-credentials' };
    }

    // Fetch from API using Node's https module
    try {
        const response = fetchFromApi(token);

        if (!response) {
            const stale = readStaleCache();
            if (stale && !stale.error)
                return stale;
            return { error: 'api-error' };
        }

        const apiData = parseApiUsageResponse(response);
        if (!apiData) {
            const stale = readStaleCache();
            if (stale && !stale.error)
                return stale;
            return { error: 'parse-error' };
        }

        // Validate we got actual data
        if (apiData.sessionUsage === undefined && apiData.weeklyUsage === undefined) {
            const stale = readStaleCache();
            if (stale && !stale.error)
                return stale;
            return { error: 'parse-error' };
        }

        // Save to cache
        try {
            const cacheDir = path.dirname(CACHE_FILE);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            fs.writeFileSync(CACHE_FILE, JSON.stringify(apiData));
        } catch {
            // Ignore cache write errors
        }

        cachedData = apiData;
        cacheTime = now;
        return apiData;
    } catch {
        const stale = readStaleCache();
        if (stale && !stale.error)
            return stale;
        return { error: 'parse-error' };
    }
}

function getErrorMessage(error: ApiError): string {
    switch (error) {
    case 'no-credentials': return '[No credentials]';
    case 'timeout': return '[Timeout]';
    case 'api-error': return '[API Error]';
    case 'parse-error': return '[Parse Error]';
    }
}

function makeProgressBar(percent: number, width = 15): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

// Session Usage Widget
export class SessionUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows daily/session API usage percentage'; }
    getDisplayName(): string { return 'Session Usage'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview)
            return 'Session: [███░░░░░░░░░░░░] 20%';

        const data = fetchApiData();
        if (data.error)
            return getErrorMessage(data.error);
        if (data.sessionUsage === undefined)
            return null;

        const percent = data.sessionUsage;
        return `Session: ${makeProgressBar(percent)} ${percent.toFixed(1)}%`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

// Weekly Usage Widget
export class WeeklyUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows weekly API usage percentage'; }
    getDisplayName(): string { return 'Weekly Usage'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview)
            return 'Weekly: [██░░░░░░░░░░░░░] 12%';

        const data = fetchApiData();
        if (data.error)
            return getErrorMessage(data.error);
        if (data.weeklyUsage === undefined)
            return null;

        const percent = data.weeklyUsage;
        return `Weekly: ${makeProgressBar(percent)} ${percent.toFixed(1)}%`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

// Reset Timer Widget — shows extra usage spending when weekly limit is reached, otherwise reset timer
export class ResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows extra usage spending or time until limit reset'; }
    getDisplayName(): string { return 'Reset Timer'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview)
            return '4:30 hr';

        const data = fetchApiData();
        if (data.error)
            return getErrorMessage(data.error);

        // When extra usage is active, show spending instead of reset timer
        if (data.extraUsageEnabled && data.extraUsageUsed !== undefined && data.extraUsageLimit !== undefined) {
            const used = formatCents(data.extraUsageUsed);
            const limit = formatCents(data.extraUsageLimit);
            return `Extra: ${used}/${limit}`;
        }

        if (!data.sessionResetAt)
            return null;

        try {
            const resetTime = new Date(data.sessionResetAt).getTime();
            const now = Date.now();
            const diffMs = resetTime - now;

            if (diffMs <= 0)
                return '0:00 hr';

            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return `${hours}:${minutes.toString().padStart(2, '0')} hr`;
        } catch {
            return null;
        }
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

function getCurrencySymbol(): string {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz.startsWith('Europe/'))
            return '€';
    } catch {
        // Fall through to default
    }
    return '$';
}

function formatCents(cents: number): string {
    const symbol = getCurrencySymbol();
    return `${symbol}${(cents / 100).toFixed(2)}`;
}

// Context Bar Widget (enhanced context display)
export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview)
            return 'Context: [████░░░░░░░░░░░] 50k/200k (25%)';

        const cw = context.data?.context_window;
        if (!cw)
            return null;

        const total = Number(cw.context_window_size) || 200000;

        // current_usage can be a number or an object with token breakdown
        let used = 0;
        if (typeof cw.current_usage === 'number') {
            used = cw.current_usage;
        } else if (cw.current_usage && typeof cw.current_usage === 'object') {
            const u = cw.current_usage;
            used = (Number(u.input_tokens) || 0)
                + (Number(u.output_tokens) || 0)
                + (Number(u.cache_creation_input_tokens) || 0)
                + (Number(u.cache_read_input_tokens) || 0);
        }

        if (isNaN(total) || isNaN(used))
            return null;

        const percent = total > 0 ? (used / total) * 100 : 0;

        const usedK = Math.round(used / 1000);
        const totalK = Math.round(total / 1000);

        return `Context: ${makeProgressBar(percent)} ${usedK}k/${totalK}k (${Math.round(percent)}%)`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}