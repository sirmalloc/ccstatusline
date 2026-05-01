import {
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync
} from 'fs';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export type WakatimeError = 'no-credentials' | 'timeout' | 'api-error' | 'parse-error';

export interface WakatimeData {
    digital?: string;
    text?: string;
    decimal?: string;
    totalSeconds?: number;
    error?: WakatimeError;
}

export interface WakatimeFetchDeps {
    existsSync: typeof existsSync;
    mkdirSync: typeof mkdirSync;
    readFileSync: typeof readFileSync;
    statSync: typeof statSync;
    writeFileSync: typeof writeFileSync;
    getHomedir: typeof os.homedir;
    now: typeof Date.now;
    getEnv: () => NodeJS.ProcessEnv;
    httpsRequest: typeof https.request;
}

const DEFAULT_DEPS: WakatimeFetchDeps = {
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
    getHomedir: os.homedir,
    now: Date.now,
    getEnv: () => process.env,
    httpsRequest: https.request
};

const WAKATIME_API_HOST = 'api.wakatime.com';
const WAKATIME_API_PATH = '/api/v1/users/current/statusbar/today';
export const WAKATIME_FETCH_TIMEOUT_MS = 2000;
export const WAKATIME_CACHE_TTL_MS = 60_000;

function getCacheDir(deps: WakatimeFetchDeps): string {
    return path.join(deps.getHomedir(), '.cache', 'ccstatusline', 'wakatime');
}

function getCachePath(apiKey: string, deps: WakatimeFetchDeps): string {
    // Hash the key so it never lands on disk in plain text.
    const hash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    return path.join(getCacheDir(deps), `wakatime-${hash}.json`);
}

/**
 * Resolve the path to ~/.wakatime.cfg, honoring the standard `WAKATIME_HOME`
 * override used by the official wakatime-cli.
 */
export function resolveWakatimeConfigPath(deps: WakatimeFetchDeps = DEFAULT_DEPS): string {
    const env = deps.getEnv();
    const overrideHome = env.WAKATIME_HOME?.trim();
    const home = overrideHome && overrideHome.length > 0 ? overrideHome : deps.getHomedir();
    return path.join(home, '.wakatime.cfg');
}

/**
 * Parse an INI-style .wakatime.cfg and return the api_key from the [settings]
 * section. Returns null when the file is missing, malformed, or the key is
 * absent / empty. The key never appears in error messages or logs.
 */
export function parseWakatimeApiKey(rawConfig: string): string | null {
    let inSettings = false;

    for (const rawLine of rawConfig.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }

        const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
        if (sectionMatch) {
            inSettings = sectionMatch[1]?.trim().toLowerCase() === 'settings';
            continue;
        }

        if (!inSettings) {
            continue;
        }

        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }

        const key = line.slice(0, eqIndex).trim().toLowerCase();
        if (key !== 'api_key' && key !== 'apikey') {
            continue;
        }

        const value = line.slice(eqIndex + 1).trim();
        if (value.length === 0) {
            return null;
        }

        return value;
    }

    return null;
}

export function readWakatimeApiKey(deps: WakatimeFetchDeps = DEFAULT_DEPS): string | null {
    const configPath = resolveWakatimeConfigPath(deps);
    try {
        if (!deps.existsSync(configPath)) {
            return null;
        }
        return parseWakatimeApiKey(deps.readFileSync(configPath, 'utf-8'));
    } catch {
        return null;
    }
}

interface WakatimeApiResponse {
    data?: {
        grand_total?: {
            digital?: unknown;
            text?: unknown;
            decimal?: unknown;
            total_seconds?: unknown;
        };
    };
}

function parseWakatimeApiBody(rawBody: string): WakatimeData | null {
    let parsed: WakatimeApiResponse;
    try {
        parsed = JSON.parse(rawBody) as WakatimeApiResponse;
    } catch {
        return null;
    }

    const grandTotal = parsed.data?.grand_total;
    if (!grandTotal) {
        return null;
    }

    const digital = typeof grandTotal.digital === 'string' ? grandTotal.digital : undefined;
    const text = typeof grandTotal.text === 'string' ? grandTotal.text : undefined;
    const decimal = typeof grandTotal.decimal === 'string' ? grandTotal.decimal : undefined;
    const totalSeconds = typeof grandTotal.total_seconds === 'number' ? grandTotal.total_seconds : undefined;

    if (digital === undefined && text === undefined && decimal === undefined && totalSeconds === undefined) {
        return null;
    }

    return { digital, text, decimal, totalSeconds };
}

function getProxyUrl(deps: WakatimeFetchDeps): string | null {
    const env = deps.getEnv();
    const proxyUrl = env.HTTPS_PROXY?.trim() ?? env.https_proxy?.trim();
    return proxyUrl && proxyUrl.length > 0 ? proxyUrl : null;
}

function readDiskCache(cachePath: string, deps: WakatimeFetchDeps): WakatimeData | null {
    try {
        if (!deps.existsSync(cachePath)) {
            return null;
        }
        const age = deps.now() - deps.statSync(cachePath).mtimeMs;
        if (age > WAKATIME_CACHE_TTL_MS) {
            return null;
        }
        const content = deps.readFileSync(cachePath, 'utf-8').trim();
        if (content.length === 0) {
            return null;
        }
        const parsed = JSON.parse(content) as WakatimeData;
        return parsed;
    } catch {
        return null;
    }
}

function writeDiskCache(cachePath: string, data: WakatimeData, deps: WakatimeFetchDeps): void {
    try {
        const cacheDir = path.dirname(cachePath);
        if (!deps.existsSync(cacheDir)) {
            deps.mkdirSync(cacheDir, { recursive: true });
        }
        deps.writeFileSync(cachePath, JSON.stringify(data), 'utf-8');
    } catch {
        // best-effort
    }
}

async function performHttpsFetch(apiKey: string, deps: WakatimeFetchDeps): Promise<WakatimeData> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: WakatimeData) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };

        // The Wakatime API expects HTTP Basic auth using the api key as the
        // user portion (no password). Encode in Node's safe Buffer API and
        // never echo the key to logs/errors.
        const basicAuth = Buffer.from(`${apiKey}:`, 'utf-8').toString('base64');

        const proxyUrl = getProxyUrl(deps);

        const requestOptions: https.RequestOptions = {
            hostname: WAKATIME_API_HOST,
            path: WAKATIME_API_PATH,
            method: 'GET',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Accept': 'application/json',
                'User-Agent': 'ccstatusline'
            },
            timeout: WAKATIME_FETCH_TIMEOUT_MS
        };

        if (proxyUrl) {
            try {
                requestOptions.agent = new HttpsProxyAgent(proxyUrl);
            } catch {
                finish({ error: 'api-error' });
                return;
            }
        }

        const request = deps.httpsRequest(requestOptions, (response) => {
            let data = '';
            response.setEncoding('utf8');

            response.on('data', (chunk: string) => {
                data += chunk;
            });

            response.on('end', () => {
                if (response.statusCode === 200 && data) {
                    const parsed = parseWakatimeApiBody(data);
                    finish(parsed ?? { error: 'parse-error' });
                    return;
                }
                finish({ error: 'api-error' });
            });
        });

        request.on('error', () => {
            finish({ error: 'api-error' });
        });
        request.on('timeout', () => {
            request.destroy();
            finish({ error: 'timeout' });
        });
        request.end();
    });
}

/**
 * Fetch today's coding-time summary from Wakatime, with a 60-second on-disk
 * cache and a 2-second hard timeout. Returns `{ error: 'no-credentials' }`
 * when the API key is missing so the widget can render empty without
 * crashing.
 */
export async function fetchWakatimeData(deps: WakatimeFetchDeps = DEFAULT_DEPS): Promise<WakatimeData> {
    const apiKey = readWakatimeApiKey(deps);
    if (!apiKey) {
        return { error: 'no-credentials' };
    }

    const cachePath = getCachePath(apiKey, deps);
    const cached = readDiskCache(cachePath, deps);
    if (cached) {
        return cached;
    }

    const result = await performHttpsFetch(apiKey, deps);
    if (!result.error) {
        writeDiskCache(cachePath, result, deps);
    }
    return result;
}
