import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    FUTURE_TOLERANCE_MS,
    LOOKBACK_MS,
    type SessionUsageReading
} from './session-forecast';

const HISTORY_SCHEMA_VERSION = 1 as const;
// One window's reset time jitters between sources (the API sends fractional
// seconds that change between fetches, the payload whole seconds), while two
// different windows' resets are always at least 5 hours apart.
const WINDOW_MATCH_MS = 60 * 60 * 1000;
// An unchanged percent only moves its reading's last-seen time this often, so an
// active session writes about once a minute rather than on every render.
const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 1000;

interface SessionUsageWindow {
    resetAt: number;
    readings: SessionUsageReading[];
}

interface SessionUsageHistory {
    version: typeof HISTORY_SCHEMA_VERSION;
    profiles: Record<string, SessionUsageWindow[]>;
}

export interface SessionUsageHistoryDeps {
    readFileSync: (path: string) => string;
    writeFileSync: (path: string, data: string) => void;
    renameSync: (from: string, to: string) => void;
    mkdirSync: (path: string) => void;
    now: () => number;
    cachePath: string;
}

// Built per call rather than at import, so the path follows HOME at render time.
export function getDefaultSessionUsageHistoryDeps(): SessionUsageHistoryDeps {
    return {
        readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
        writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
        renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
        mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
        now: () => Date.now(),
        cachePath: path.join(os.homedir(), '.cache', 'ccstatusline', 'session-usage-history.json')
    };
}

function isReading(value: unknown): value is SessionUsageReading {
    return Array.isArray(value)
        && value.length === 3
        && value.every(part => typeof part === 'number' && Number.isFinite(part));
}

function isUsageWindow(value: unknown): value is SessionUsageWindow {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const usageWindow = value as Record<string, unknown>;
    return typeof usageWindow.resetAt === 'number'
        && Array.isArray(usageWindow.readings)
        && usageWindow.readings.every(isReading);
}

function readHistory(deps: SessionUsageHistoryDeps): SessionUsageHistory {
    const empty: SessionUsageHistory = { version: HISTORY_SCHEMA_VERSION, profiles: {} };
    try {
        const parsed = JSON.parse(deps.readFileSync(deps.cachePath)) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return empty;
        }

        const data = parsed as { version?: unknown; profiles?: unknown };
        if (data.version !== HISTORY_SCHEMA_VERSION || typeof data.profiles !== 'object' || data.profiles === null) {
            return empty;
        }

        const profiles: Record<string, SessionUsageWindow[]> = {};
        for (const [key, windows] of Object.entries(data.profiles)) {
            if (Array.isArray(windows)) {
                profiles[key] = windows.filter(isUsageWindow);
            }
        }

        return { version: HISTORY_SCHEMA_VERSION, profiles };
    } catch {
        // A missing or corrupt history is an empty one, never a failure.
        return empty;
    }
}

// Drops windows that have reset and readings from a clock that has since moved
// back, and keeps only what the forecast can still use: the last reading first
// seen at or before the lookback's start, and everything after it.
function pruneWindows(windows: SessionUsageWindow[], nowMs: number): SessionUsageWindow[] {
    const lookbackStartMs = nowMs - LOOKBACK_MS;
    return windows
        .filter(usageWindow => usageWindow.resetAt > nowMs)
        .map((usageWindow) => {
            const readings = usageWindow.readings.filter(([firstSeenMs]) => firstSeenMs <= nowMs + FUTURE_TOLERANCE_MS);
            let keepFrom = 0;
            for (let index = 0; index < readings.length; index++) {
                if ((readings[index]?.[0] ?? Number.POSITIVE_INFINITY) <= lookbackStartMs) {
                    keepFrom = index;
                }
            }

            return { resetAt: usageWindow.resetAt, readings: readings.slice(keepFrom) };
        });
}

/**
 * Records the current session percent in this profile's 5-hour window and
 * returns the window's readings for the forecast. Best-effort: a failed write
 * still returns the readings, and nothing here throws.
 */
export function recordSessionUsageReading(
    profileKey: string,
    resetAtMs: number,
    percent: number,
    deps: SessionUsageHistoryDeps = getDefaultSessionUsageHistoryDeps()
): SessionUsageReading[] {
    const nowMs = deps.now();
    const clampedPercent = Math.max(0, Math.min(100, percent));

    const profiles: Record<string, SessionUsageWindow[]> = {};
    for (const [key, windows] of Object.entries(readHistory(deps).profiles)) {
        const kept = pruneWindows(windows, nowMs);
        if (kept.length > 0) {
            profiles[key] = kept;
        }
    }

    const windows = profiles[profileKey] ?? [];
    let usageWindow = windows.find(candidate => Math.abs(candidate.resetAt - resetAtMs) <= WINDOW_MATCH_MS);
    if (!usageWindow) {
        usageWindow = { resetAt: resetAtMs, readings: [] };
        windows.push(usageWindow);
    }
    profiles[profileKey] = windows;

    const readings = usageWindow.readings;
    const last = readings[readings.length - 1];
    // Usage never falls within a window: a lower percent is another session's
    // stale payload, and recording it would fake a steep climb later.
    if (last !== undefined && clampedPercent < last[2]) {
        return readings;
    }

    if (last?.[2] !== clampedPercent) {
        readings.push([nowMs, nowMs, clampedPercent]);
    } else if (nowMs - last[1] >= LAST_SEEN_WRITE_INTERVAL_MS) {
        last[1] = nowMs;
    } else {
        return readings;
    }

    try {
        deps.mkdirSync(path.dirname(deps.cachePath));
        const tempPath = `${deps.cachePath}.${process.pid}.tmp`;
        const history: SessionUsageHistory = { version: HISTORY_SCHEMA_VERSION, profiles };
        deps.writeFileSync(tempPath, JSON.stringify(history));
        deps.renameSync(tempPath, deps.cachePath);
    } catch {
        // Best-effort history; the status line must render regardless.
    }

    return readings;
}
