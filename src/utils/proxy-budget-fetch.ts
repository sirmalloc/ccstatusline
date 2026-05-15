import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_FILE = path.join(CACHE_DIR, 'proxy-budget.json');
const LOCK_FILE = path.join(CACHE_DIR, 'proxy-budget.lock');
const DEFAULT_TTL_SEC = 60;
const DEFAULT_TIMEOUT_MS = 3000;
const STALE_FALLBACK_MULTIPLIER = 10;
const SANITY_BUDGET_MULTIPLIER = 2;

export interface ProxyBudgetData {
    spend: number;
    budget: number;
    percentage: number;
    resetAt: string | null;
}

interface ProxyBudgetPresetDef {
    endpoint: string;
    spendPath: string;
    budgetPath: string;
    resetAtPath: string;
    authScheme: 'bearer' | 'x-api-key';
}

// To add a new preset: add a single entry to this object. The type, the
// runtime validator, and the test matrix all derive from the keys here.
export const PROXY_BUDGET_PRESETS = {
    litellm: {
        endpoint: '${baseUrl}/key/info',
        spendPath: 'info.spend',
        budgetPath: 'info.max_budget',
        resetAtPath: 'info.budget_reset_at',
        authScheme: 'bearer'
    },
    openrouter: {
        endpoint: '${baseUrl}/api/v1/key',
        spendPath: 'data.usage',
        budgetPath: 'data.limit',
        resetAtPath: 'data.limit_reset',
        authScheme: 'bearer'
    }
} as const satisfies Record<string, ProxyBudgetPresetDef>;

export type ProxyBudgetPreset = keyof typeof PROXY_BUDGET_PRESETS;

export function isProxyBudgetPreset(value: string): value is ProxyBudgetPreset {
    return Object.prototype.hasOwnProperty.call(PROXY_BUDGET_PRESETS, value);
}

export interface ProxyBudgetFetchOptions {
    preset?: ProxyBudgetPreset;
    endpoint?: string;
    baseUrlEnv?: string;
    tokenEnv?: string;
    authScheme?: 'bearer' | 'x-api-key';
    spendPath?: string;
    budgetPath?: string;
    resetAtPath?: string;
    cacheTtlSec?: number;
    timeoutMs?: number;
}

function resolveWithPreset(opts: ProxyBudgetFetchOptions): {
    endpoint: string | undefined;
    spendPath: string;
    budgetPath: string;
    resetAtPath: string;
    authScheme: 'bearer' | 'x-api-key';
} {
    const preset = opts.preset ? PROXY_BUDGET_PRESETS[opts.preset] : PROXY_BUDGET_PRESETS.litellm;
    return {
        endpoint: opts.endpoint ?? preset.endpoint,
        spendPath: opts.spendPath ?? preset.spendPath,
        budgetPath: opts.budgetPath ?? preset.budgetPath,
        resetAtPath: opts.resetAtPath ?? preset.resetAtPath,
        authScheme: opts.authScheme ?? preset.authScheme
    };
}

const CachedSchema = z.object({
    data: z.object({
        spend: z.number(),
        budget: z.number(),
        percentage: z.number(),
        resetAt: z.string().nullable()
    }),
    timestamp: z.number()
});

function ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function pickPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

function readCacheIfFresh(ttlSec: number): ProxyBudgetData | null {
    try {
        const parsed = CachedSchema.safeParse(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
        if (!parsed.success)
            return null;
        const ageSec = (Date.now() - parsed.data.timestamp) / 1000;
        if (ageSec < ttlSec)
            return parsed.data.data;
        return null;
    } catch {
        return null;
    }
}

function readStaleCache(maxAgeSec: number): ProxyBudgetData | null {
    try {
        const parsed = CachedSchema.safeParse(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
        if (!parsed.success)
            return null;
        const ageSec = (Date.now() - parsed.data.timestamp) / 1000;
        if (ageSec < maxAgeSec)
            return parsed.data.data;
        return null;
    } catch {
        return null;
    }
}

function writeCache(data: ProxyBudgetData): void {
    try {
        ensureCacheDir();
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
        // Best-effort cache write; ignore failures
    }
}

function resolveEndpoint(endpoint: string | undefined, baseUrl: string | undefined): string | null {
    if (endpoint && endpoint.length > 0) {
        if (endpoint.includes('${baseUrl}')) {
            if (!baseUrl)
                return null;
            return endpoint.replace('${baseUrl}', baseUrl.replace(/\/+$/, ''));
        }
        return endpoint;
    }
    if (!baseUrl)
        return null;
    return `${baseUrl.replace(/\/+$/, '')}/key/info`;
}

function isProxyLocked(now: number): boolean {
    try {
        const stat = fs.statSync(LOCK_FILE);
        const lockMtimeSec = Math.floor(stat.mtimeMs / 1000);
        return now - lockMtimeSec < 5;
    } catch {
        return false;
    }
}

function writeLock(): void {
    try {
        ensureCacheDir();
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ ts: Date.now() }));
    } catch {
        // Ignore lock-file errors
    }
}

function clearLock(): void {
    try {
        fs.unlinkSync(LOCK_FILE);
    } catch {
        // Ignore
    }
}

async function performHttpGet(
    url: string,
    headers: Record<string, string>,
    timeoutMs: number
): Promise<{ status: number; body: string } | null> {
    return new Promise((resolve) => {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            resolve(null);
            return;
        }

        const isHttps = parsedUrl.protocol === 'https:';
        const lib = isHttps ? https : http;
        const req = lib.request(
            {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: `${parsedUrl.pathname}${parsedUrl.search}`,
                method: 'GET',
                headers
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf8')
                    });
                });
                res.on('error', () => { resolve(null); });
            }
        );

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(null);
        });
        req.on('error', () => { resolve(null); });
        req.end();
    });
}

export async function fetchProxyBudget(opts: ProxyBudgetFetchOptions = {}): Promise<ProxyBudgetData | null> {
    const baseUrlEnv = opts.baseUrlEnv ?? 'ANTHROPIC_BASE_URL';
    const tokenEnv = opts.tokenEnv ?? 'ANTHROPIC_AUTH_TOKEN';
    const baseUrl = process.env[baseUrlEnv];
    const token = process.env[tokenEnv];
    const ttlSec = opts.cacheTtlSec ?? DEFAULT_TTL_SEC;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const resolved = resolveWithPreset(opts);

    if (!token) {
        return null;
    }

    const endpoint = resolveEndpoint(resolved.endpoint, baseUrl);
    if (!endpoint) {
        return null;
    }

    const fresh = readCacheIfFresh(ttlSec);
    if (fresh) {
        return fresh;
    }

    const now = Math.floor(Date.now() / 1000);
    if (isProxyLocked(now)) {
        return readStaleCache(ttlSec * STALE_FALLBACK_MULTIPLIER);
    }

    writeLock();
    try {
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'User-Agent': 'ccstatusline'
        };
        if (resolved.authScheme === 'x-api-key') {
            headers['x-api-key'] = token;
        } else {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await performHttpGet(endpoint, headers, timeoutMs);
        if (!response || response.status < 200 || response.status >= 300) {
            return readStaleCache(ttlSec * STALE_FALLBACK_MULTIPLIER);
        }

        let body: unknown;
        try {
            body = JSON.parse(response.body);
        } catch {
            return readStaleCache(ttlSec * STALE_FALLBACK_MULTIPLIER);
        }

        const spendRaw = pickPath(body, resolved.spendPath);
        const budgetRaw = pickPath(body, resolved.budgetPath);
        const resetAtRaw = pickPath(body, resolved.resetAtPath);

        const spend = typeof spendRaw === 'number' && Number.isFinite(spendRaw) ? spendRaw : null;
        const budget = typeof budgetRaw === 'number' && Number.isFinite(budgetRaw) ? budgetRaw : null;
        const resetAt = typeof resetAtRaw === 'string' ? resetAtRaw : null;

        if (spend === null || budget === null) {
            return readStaleCache(ttlSec * STALE_FALLBACK_MULTIPLIER);
        }
        if (budget <= 0) {
            return null;
        }
        if (spend > budget * SANITY_BUDGET_MULTIPLIER) {
            return null;
        }

        const data: ProxyBudgetData = {
            spend,
            budget,
            percentage: Math.min(100, (spend / budget) * 100),
            resetAt
        };
        writeCache(data);
        return data;
    } finally {
        clearLock();
    }
}
