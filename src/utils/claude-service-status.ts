import * as fs from 'fs';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import type { ColorLevelString } from '../types/ColorLevel';
import type { WidgetItem } from '../types/Widget';

import { getColorAnsiCode } from './colors';

// Cache configuration mirrors usage-fetch.ts: a short-lived disk cache shared
// across statusline invocations, plus a failure lock so an unreachable status
// page cannot trigger a network attempt on every render.
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_FILE = path.join(CACHE_DIR, 'claude-status.json');
const LOCK_FILE = path.join(CACHE_DIR, 'claude-status.lock');
const CACHE_MAX_AGE = 300;       // seconds - refresh service status every ~5 minutes
const FAILURE_BACKOFF = 30;      // seconds - wait before retrying after a failed fetch

const STATUS_HOST = 'status.claude.com';
const STATUS_PATH = '/api/v2/status.json';
const INCIDENTS_PATH = '/api/v2/incidents.json';
const STATUS_TIMEOUT_MS = 5000;

// The incident-history strip covers the past 48 hours as 8 six-hour buckets.
export const INCIDENT_HISTORY_BUCKET_COUNT = 8;
export const INCIDENT_HISTORY_BUCKET_MS = 6 * 60 * 60 * 1000;

export type ClaudeIncidentImpact = 'none' | 'minor' | 'major' | 'critical';

export interface ClaudeIncidentWindow {
    impact: Exclude<ClaudeIncidentImpact, 'none'>;
    startMs: number;
    endMs: number | null;  // null while the incident is unresolved
}

export interface ClaudeServiceStatusData {
    indicator?: string;
    incidents?: ClaudeIncidentWindow[];
    error?: boolean;
}

const IMPACT_RANK: Record<Exclude<ClaudeIncidentImpact, 'none'>, number> = {
    minor: 1,
    major: 2,
    critical: 3
};

function isTrackedIncidentImpact(impact: string): impact is Exclude<ClaudeIncidentImpact, 'none'> {
    return impact === 'minor' || impact === 'major' || impact === 'critical';
}

/**
 * Divide the `bucketCount * bucketMs` window ending at `nowMs` into buckets
 * (oldest first) and return the worst incident impact overlapping each bucket.
 * Buckets without any overlapping incident report 'none'.
 */
export function computeIncidentHistoryBuckets(
    incidents: ClaudeIncidentWindow[],
    nowMs: number,
    bucketCount = INCIDENT_HISTORY_BUCKET_COUNT,
    bucketMs = INCIDENT_HISTORY_BUCKET_MS
): ClaudeIncidentImpact[] {
    const buckets: ClaudeIncidentImpact[] = [];

    for (let i = 0; i < bucketCount; i++) {
        const bucketStart = nowMs - (bucketCount - i) * bucketMs;
        const bucketEnd = bucketStart + bucketMs;
        let worst: ClaudeIncidentImpact = 'none';
        let worstRank = 0;

        for (const incident of incidents) {
            const incidentEnd = incident.endMs ?? nowMs;
            if (incident.startMs < bucketEnd && incidentEnd > bucketStart) {
                const rank = IMPACT_RANK[incident.impact];
                if (rank > worstRank) {
                    worstRank = rank;
                    worst = incident.impact;
                }
            }
        }

        buckets.push(worst);
    }

    return buckets;
}

// statuspage.io payloads. Only the fields this module reads are declared;
// loose objects pass everything else through without failing validation.
const StatusResponseSchema = z.looseObject({ status: z.looseObject({ indicator: z.string().nullable().optional() }).nullable().optional() });

const IncidentsResponseSchema = z.looseObject({
    incidents: z.array(z.looseObject({
        impact: z.string().nullable().optional(),
        started_at: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        resolved_at: z.string().nullable().optional()
    })).nullable().optional()
});

function parseJsonWithSchema<T>(rawJson: string, schema: z.ZodType<T>): T | null {
    try {
        const parsed = schema.safeParse(JSON.parse(rawJson));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function parseClaudeStatusResponse(rawJson: string): string | null {
    return parseJsonWithSchema(rawJson, StatusResponseSchema)?.status?.indicator ?? null;
}

function parseTimestampMs(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Extract the incident windows relevant to the history strip. Incidents with
 * impact 'none' (or an unrecognized impact) and incidents without a parseable
 * started_at or created_at are dropped.
 */
export function parseClaudeIncidentsResponse(rawJson: string): ClaudeIncidentWindow[] | null {
    const parsed = parseJsonWithSchema(rawJson, IncidentsResponseSchema);
    if (!parsed) {
        return null;
    }

    const windows: ClaudeIncidentWindow[] = [];
    for (const incident of parsed.incidents ?? []) {
        const impact = incident.impact ?? '';
        if (!isTrackedIncidentImpact(impact)) {
            continue;
        }

        const startMs = parseTimestampMs(incident.started_at)
            ?? parseTimestampMs(incident.created_at);
        if (startMs === null) {
            continue;
        }

        windows.push({
            impact,
            startMs,
            endMs: parseTimestampMs(incident.resolved_at)
        });
    }

    return windows;
}

// Per-bucket bar colors, resolved per color level so the strip degrades
// sensibly: statuspage "major" is conventionally orange, which only exists
// above ansi16 - there it falls back to red (with critical on bright red).
// The named-palette hues from colors.ts are reused where they exist.
const IMPACT_COLOR_SPECS: Record<ClaudeIncidentImpact | 'maintenance' | 'unknown', Record<ColorLevelString, string>> = {
    none: { ansi16: '\x1b[32m', ansi256: 'ansi256:70', truecolor: 'hex:4e9a06' },
    minor: { ansi16: '\x1b[33m', ansi256: 'ansi256:178', truecolor: 'hex:c4a000' },
    major: { ansi16: '\x1b[31m', ansi256: 'ansi256:208', truecolor: 'hex:ff8700' },
    critical: { ansi16: '\x1b[91m', ansi256: 'ansi256:160', truecolor: 'hex:cc0000' },
    maintenance: { ansi16: '\x1b[36m', ansi256: 'ansi256:30', truecolor: 'hex:06989a' },
    unknown: { ansi16: '\x1b[90m', ansi256: 'ansi256:59', truecolor: 'hex:555753' }
};

export type ClaudeStatusColorKey = keyof typeof IMPACT_COLOR_SPECS;

export function getClaudeStatusFgCode(key: ClaudeStatusColorKey, colorLevel: ColorLevelString): string {
    const spec = IMPACT_COLOR_SPECS[key][colorLevel];
    return spec.startsWith('\x1b') ? spec : getColorAnsiCode(spec, colorLevel, false);
}

// --- Prefetch plumbing (mirrors usage-prefetch.ts) ---

export const CLAUDE_STATUS_WIDGET_TYPE = 'claude-status';

export function isClaudeStatusHistoryEnabled(item: WidgetItem): boolean {
    return item.type === CLAUDE_STATUS_WIDGET_TYPE && item.metadata?.history === 'true';
}

export function hasClaudeStatusWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => item.type === CLAUDE_STATUS_WIDGET_TYPE));
}

function claudeStatusNeedsIncidents(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => isClaudeStatusHistoryEnabled(item)));
}

const CachedClaudeStatusSchema = z.object({
    fetchedAt: z.number(),
    indicator: z.string().nullable().optional(),
    incidents: z.array(z.object({
        impact: z.enum(['minor', 'major', 'critical']),
        startMs: z.number(),
        endMs: z.number().nullable()
    })).nullable().optional(),
    incidentsQueried: z.boolean()
});

type CachedClaudeStatus = z.infer<typeof CachedClaudeStatusSchema>;

// Memory cache so multiple lines in one invocation share a single lookup
let memoryCache: CachedClaudeStatus | null = null;

function ensureCacheDirExists(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function readCachedClaudeStatus(): CachedClaudeStatus | null {
    try {
        return parseJsonWithSchema(fs.readFileSync(CACHE_FILE, 'utf8'), CachedClaudeStatusSchema);
    } catch {
        return null;
    }
}

function writeCachedClaudeStatus(cache: CachedClaudeStatus): void {
    try {
        ensureCacheDirExists();
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    } catch {
        // Best-effort caching
    }
}

function isFailureLockActive(nowSeconds: number): boolean {
    try {
        const lockMtime = Math.floor(fs.statSync(LOCK_FILE).mtimeMs / 1000);
        return nowSeconds - lockMtime < FAILURE_BACKOFF;
    } catch {
        return false;
    }
}

function writeFailureLock(): void {
    try {
        ensureCacheDirExists();
        fs.writeFileSync(LOCK_FILE, '');
    } catch {
        // Ignore lock file errors
    }
}

function clearFailureLock(): void {
    try {
        fs.rmSync(LOCK_FILE, { force: true });
    } catch {
        // Ignore lock file errors
    }
}

function getStatusPageProxyUrl(): string | null {
    const proxyUrl = process.env.HTTPS_PROXY?.trim();
    return proxyUrl?.length ? proxyUrl : null;
}

interface StatusPageResponse {
    statusCode?: number;
    setEncoding(encoding: BufferEncoding): unknown;
    on(event: 'data', listener: (chunk: string) => void): unknown;
    on(event: 'end' | 'aborted' | 'error', listener: () => void): unknown;
}

interface StatusPageRequest {
    destroy(): void;
    end(): void;
    on(event: 'error' | 'timeout', listener: () => void): unknown;
}

type StatusPageRequestFn = (
    options: https.RequestOptions,
    onResponse: (response: StatusPageResponse) => void
) => StatusPageRequest;

const requestStatusPage: StatusPageRequestFn = (options, onResponse) => https.request(options, onResponse);

function fetchStatusPagePath(
    pathName: string,
    requestFn: StatusPageRequestFn = requestStatusPage
): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (value: string | null) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };

        let requestOptions: https.RequestOptions;
        try {
            const proxyUrl = getStatusPageProxyUrl();
            requestOptions = {
                hostname: STATUS_HOST,
                path: pathName,
                method: 'GET',
                timeout: STATUS_TIMEOUT_MS,
                ...(proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {})
            };
        } catch {
            finish(null);
            return;
        }

        const request = requestFn(requestOptions, (response) => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
                data += chunk;
            });
            response.on('end', () => {
                finish(response.statusCode === 200 && data ? data : null);
            });
            response.on('aborted', () => { finish(null); });
            response.on('error', () => { finish(null); });
        });

        request.on('error', () => { finish(null); });
        request.on('timeout', () => {
            request.destroy();
            finish(null);
        });
        request.end();
    });
}

// Exposed only for deterministic response-stream failure tests.
export const __testing = { fetchStatusPagePath };

function toStatusData(cache: CachedClaudeStatus): ClaudeServiceStatusData {
    return {
        indicator: cache.indicator ?? undefined,
        incidents: cache.incidents ?? undefined
    };
}

function isCacheUsable(cache: CachedClaudeStatus, includeIncidents: boolean): boolean {
    return !includeIncidents || cache.incidentsQueried;
}

async function fetchClaudeServiceStatus(includeIncidents: boolean): Promise<ClaudeServiceStatusData> {
    const nowMs = Date.now();
    const nowSeconds = Math.floor(nowMs / 1000);

    if (memoryCache
        && nowSeconds - Math.floor(memoryCache.fetchedAt / 1000) < CACHE_MAX_AGE
        && isCacheUsable(memoryCache, includeIncidents)) {
        return toStatusData(memoryCache);
    }

    const diskCache = readCachedClaudeStatus();
    if (diskCache
        && nowSeconds - Math.floor(diskCache.fetchedAt / 1000) < CACHE_MAX_AGE
        && isCacheUsable(diskCache, includeIncidents)) {
        memoryCache = diskCache;
        return toStatusData(diskCache);
    }

    const serveStaleOrError = (): ClaudeServiceStatusData => {
        if (diskCache && isCacheUsable(diskCache, includeIncidents)) {
            return toStatusData(diskCache);
        }
        return { error: true };
    };

    if (isFailureLockActive(nowSeconds)) {
        return serveStaleOrError();
    }

    const [statusBody, incidentsBody] = await Promise.all([
        fetchStatusPagePath(STATUS_PATH),
        includeIncidents ? fetchStatusPagePath(INCIDENTS_PATH) : Promise.resolve(null)
    ]);

    const indicator = statusBody !== null ? parseClaudeStatusResponse(statusBody) : null;
    const incidents = incidentsBody !== null ? parseClaudeIncidentsResponse(incidentsBody) : null;

    if (indicator === null || (includeIncidents && incidents === null)) {
        writeFailureLock();
        return serveStaleOrError();
    }

    clearFailureLock();
    const cache: CachedClaudeStatus = {
        fetchedAt: nowMs,
        indicator,
        incidents,
        incidentsQueried: includeIncidents
    };
    memoryCache = cache;
    writeCachedClaudeStatus(cache);
    return toStatusData(cache);
}

export async function prefetchClaudeStatusIfNeeded(lines: WidgetItem[][]): Promise<ClaudeServiceStatusData | null> {
    if (!hasClaudeStatusWidgets(lines)) {
        return null;
    }

    return fetchClaudeServiceStatus(claudeStatusNeedsIncidents(lines));
}
