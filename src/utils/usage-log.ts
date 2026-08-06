import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import type { UsageTrackerConfig } from '../types/Settings';

// Usage Tracker: appends every distinct rate-limit observation to a JSONL log
// for later analysis. `raw` is captured verbatim (pre-zod stdin payload /
// API response body), never mapped through UsageData shapes, so unknown
// buckets survive schema drift. No locking: concurrent sessions may rarely
// append duplicate records, which the analyzer dedups; the state file gives
// value-based dedup only. Every public function swallows all errors so
// logging can never break rendering.
//
// Must not import from usage-fetch.ts (it imports the api hook from here).
// The stdin-path account hash is instead read from the tokenHash that
// usage-fetch.ts persists in usage.json; after an account switch, stdin
// records may carry the previous account's hash until the next live API
// fetch rewrites the cache (bounded by the 180s cache TTL + 30s lock).

const LOG_ENVELOPE_VERSION = 1;

// usage-fetch.ts's CACHE_FILE, duplicated to avoid the import cycle above
const DEFAULT_USAGE_CACHE_FILE = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.json');

const UsageCacheTokenHashSchema = z.object({ tokenHash: z.string().optional() });

const UsageLogStateSchema = z.object({
    v: z.number().optional(),
    stdin: z.object({ sig: z.string() }).optional(),
    api: z.object({ sig: z.string() }).optional(),
    lastHbAt: z.number().optional()
});

type UsageLogState = z.infer<typeof UsageLogStateSchema>;

export type UsageLogSource = 'stdin' | 'api' | 'hb';

export interface UsageLogObservation {
    modelId?: string;
    sessionId?: string;
}

interface UsageLogPaths {
    logPath: string;
    rotatedPath: string;
    statePath: string;
}

interface UsageLogRecord {
    v: number;
    t: string;
    src: UsageLogSource;
    acct?: string;
    raw?: unknown;
    obs?: {
        sid?: string;
        model?: string;
    };
}

// Per-render module state; only the piped render path calls initUsageLog,
// which keeps the TUI, --hook mode, and other fetchUsageData callers silent
let activeConfig: UsageTrackerConfig | null = null;
let activeObs: UsageLogObservation = {};
let usageCacheFile = DEFAULT_USAGE_CACHE_FILE;

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }

    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort()) {
            sorted[key] = canonicalize(source[key]);
        }

        return sorted;
    }

    return value;
}

// Recursively sorted object keys so the signature is stable regardless of
// payload key ordering (arrays keep their order)
function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

// Including acct makes an account switch register as a change
function computeSignature(acct: string | undefined, raw: unknown): string {
    return createHash('sha256')
        .update(canonicalJson({ acct, raw }))
        .digest('hex')
        .slice(0, 16);
}

function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
    const xdgDataHome = env.XDG_DATA_HOME?.trim();
    // XDG data, not ~/.cache: the log is unrecoverable if deleted
    return xdgDataHome
        ? path.join(xdgDataHome, 'ccstatusline')
        : path.join(os.homedir(), '.local', 'share', 'ccstatusline');
}

// Rotated file and dedup state live next to the resolved log, including when
// config.logPath overrides the default location
function resolveLogPaths(config: UsageTrackerConfig): UsageLogPaths {
    const logPath = config.logPath ?? path.join(resolveDataDir(), 'usage-log.jsonl');
    const base = logPath.endsWith('.jsonl') ? logPath.slice(0, -'.jsonl'.length) : logPath;
    return {
        logPath,
        rotatedPath: `${base}.1.jsonl`,
        statePath: `${base}.state.json`
    };
}

// Display helper for the TUI; the log path is resolved the same way the
// logger resolves it, including the config.logPath override
export function getResolvedLogPath(config: UsageTrackerConfig): string {
    try {
        return resolveLogPaths(config).logPath;
    } catch {
        return config.logPath ?? '';
    }
}

function buildRecord(
    src: UsageLogSource,
    nowMs: number,
    acct: string | undefined,
    raw?: unknown,
    obs?: UsageLogObservation
): UsageLogRecord {
    const record: UsageLogRecord = {
        v: LOG_ENVELOPE_VERSION,
        t: new Date(nowMs).toISOString(),
        src
    };

    if (acct !== undefined) {
        record.acct = acct;
    }

    if (src !== 'hb' && raw !== undefined) {
        record.raw = raw;
    }

    if (src === 'stdin' && obs && (obs.sessionId !== undefined || obs.modelId !== undefined)) {
        record.obs = {
            ...(obs.sessionId !== undefined ? { sid: obs.sessionId.slice(0, 8) } : {}),
            ...(obs.modelId !== undefined ? { model: obs.modelId } : {})
        };
    }

    return record;
}

// lastHbAt is refreshed by every appended record (any record proves the
// logger was alive), so a heartbeat only fires after a quiet stretch
function shouldHeartbeat(lastHbAt: number | undefined, nowMs: number, heartbeatMinutes: number): boolean {
    return lastHbAt === undefined || nowMs - lastHbAt >= heartbeatMinutes * 60_000;
}

function shouldRotate(logSizeBytes: number, rotateMaxMb: number): boolean {
    return logSizeBytes > rotateMaxMb * 1024 * 1024;
}

// Corrupt or missing state degrades to "no previous signature"
function readState(statePath: string): UsageLogState {
    try {
        const parsed = UsageLogStateSchema.safeParse(JSON.parse(fs.readFileSync(statePath, 'utf8')));
        return parsed.success ? parsed.data : {};
    } catch {
        return {};
    }
}

// Atomic replace (temp file + rename) so a concurrent reader never sees a
// torn state file
function writeState(statePath: string, state: UsageLogState): void {
    const tempPath = `${statePath}.tmp.${process.pid}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify({ ...state, v: 1 }));
        fs.renameSync(tempPath, statePath);
    } catch {
        try {
            fs.rmSync(tempPath, { force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

function readStdinAccountHash(): string | undefined {
    try {
        const parsed = UsageCacheTokenHashSchema.safeParse(JSON.parse(fs.readFileSync(usageCacheFile, 'utf8')));
        return parsed.success ? parsed.data.tokenHash : undefined;
    } catch {
        return undefined;
    }
}

function rotateIfNeeded(paths: UsageLogPaths, rotateMaxMb: number): void {
    try {
        if (shouldRotate(fs.statSync(paths.logPath).size, rotateMaxMb)) {
            fs.renameSync(paths.logPath, paths.rotatedPath);
        }
    } catch {
        // Missing log or a lost rename race; skip rotation, never block the append
    }
}

function appendRecord(paths: UsageLogPaths, record: UsageLogRecord, rotateMaxMb: number): void {
    fs.mkdirSync(path.dirname(paths.logPath), { recursive: true });
    rotateIfNeeded(paths, rotateMaxMb);
    // Single O_APPEND write; lines under PIPE_BUF append atomically on POSIX,
    // oversized api lines may very rarely interleave under concurrency
    fs.appendFileSync(paths.logPath, `${JSON.stringify(record)}\n`);
}

export function initUsageLog(config: UsageTrackerConfig, obs: UsageLogObservation = {}): void {
    try {
        activeConfig = config;
        activeObs = obs;
    } catch {
        // Never let logging break rendering
    }
}

// stdin path: dedup + heartbeat + rotation. rawRateLimits must be the
// pre-zod value from the raw JSON.parse of stdin (schema validation strips
// unknown buckets).
export function logStdinRateLimits(rawRateLimits: unknown): void {
    try {
        if (!activeConfig?.enabled) {
            return;
        }

        const paths = resolveLogPaths(activeConfig);
        const state = readState(paths.statePath);
        const nowMs = Date.now();
        const acct = readStdinAccountHash();
        let appended = false;

        // A null rate_limits is "no data", not an observation worth a record
        if (rawRateLimits !== undefined && rawRateLimits !== null) {
            const sig = computeSignature(acct, rawRateLimits);
            if (state.stdin?.sig !== sig) {
                appendRecord(paths, buildRecord('stdin', nowMs, acct, rawRateLimits, activeObs), activeConfig.rotateMaxMb);
                state.stdin = { sig };
                state.lastHbAt = nowMs;
                appended = true;
            }
        }

        // Heartbeats make gaps unambiguous ("no usage" vs "not running"),
        // and run even when rate_limits is absent from the payload
        if (!appended && shouldHeartbeat(state.lastHbAt, nowMs, activeConfig.heartbeatMinutes)) {
            appendRecord(paths, buildRecord('hb', nowMs, acct), activeConfig.rotateMaxMb);
            state.lastHbAt = nowMs;
            appended = true;
        }

        if (appended) {
            writeState(paths.statePath, state);
        }
    } catch {
        // Never let logging break rendering
    }
}

// api path: called by fetchUsageData at its cache-write point, so only the
// one process that performed the live fetch logs a record. No-op unless
// initUsageLog ran, which scopes it to the piped render path.
export function logApiUsagePayload(rawBody: string, tokenHash: string | null): void {
    try {
        if (!activeConfig?.enabled || !activeConfig.logApiUsage) {
            return;
        }

        const raw: unknown = JSON.parse(rawBody);
        const acct = tokenHash ?? undefined;
        const paths = resolveLogPaths(activeConfig);
        const state = readState(paths.statePath);
        const sig = computeSignature(acct, raw);

        if (state.api?.sig === sig) {
            return;
        }

        const nowMs = Date.now();
        appendRecord(paths, buildRecord('api', nowMs, acct, raw), activeConfig.rotateMaxMb);
        writeState(paths.statePath, {
            ...state,
            api: { sig },
            lastHbAt: nowMs
        });
    } catch {
        // Never let logging break rendering
    }
}

function reset(): void {
    activeConfig = null;
    activeObs = {};
    usageCacheFile = DEFAULT_USAGE_CACHE_FILE;
}

function setUsageCacheFileForTesting(filePath: string): void {
    usageCacheFile = filePath;
}

// Exposed for tests only
export const __testing = {
    buildRecord,
    canonicalJson,
    computeSignature,
    readState,
    readStdinAccountHash,
    reset,
    resolveDataDir,
    resolveLogPaths,
    setUsageCacheFileForTesting,
    shouldHeartbeat,
    shouldRotate
};
