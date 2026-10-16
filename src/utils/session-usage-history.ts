import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { StatusJSON } from '../types/StatusJSON';

import {
    iterateJsonlLinesReverseSync,
    parseJsonlLine
} from './jsonl-lines';
import {
    FUTURE_TOLERANCE_MS,
    LOOKBACK_MS,
    type SessionUsageReading
} from './session-forecast';

const HISTORY_SCHEMA_VERSION = 1 as const;
// One window's reset time jitters by under a second between sources (the API
// sends fractional seconds that change between fetches, the payload whole
// seconds). The same login's next window resets 5 hours later, but another
// login's, after /login in the same config directory, can be minutes away.
const WINDOW_MATCH_MS = 60 * 1000;
// An unchanged percent only moves its reading's last-seen time this often, so an
// active session writes about once a minute rather than on every render.
const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 1000;
// Another render's temp file this old has been left behind, not still being
// written, so a write removes it
const ORPHANED_TEMP_FILE_AGE_MS = 60 * 1000;
// The model Claude Code names on the assistant messages it writes itself
const SYNTHETIC_MODEL = '<synthetic>';

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
    unlinkSync: (path: string) => void;
    readdirSync: (path: string) => string[];
    statSync: (path: string) => { mtimeMs: number };
    mkdirSync: (path: string) => void;
    now: () => number;
    // When the percent given was seen, for one that can be older than now: a
    // payload's is from its session's last API response, and Claude Code's
    // refresh interval re-renders an idle session with that same percent.
    // Undefined when nothing shows when that was. Left out, the percent is
    // current, as the usage API's is.
    percentSeenAt?: () => number | undefined;
    cachePath: string;
}

interface TranscriptEntry {
    type?: unknown;
    timestamp?: unknown;
    isApiErrorMessage?: unknown;
    message?: { model?: unknown } | null;
}

// When the transcript's last API response was written. Prompts, tool results
// and local commands are written too, with no new percent behind them, and so
// are the assistant messages Claude Code makes up itself (an API error's, say).
function getLastResponseAtMs(transcriptPath: string | undefined): number | undefined {
    if (transcriptPath === undefined) {
        return undefined;
    }

    try {
        for (const line of iterateJsonlLinesReverseSync(transcriptPath)) {
            const entry = parseJsonlLine(line) as TranscriptEntry | null;
            if (entry?.type !== 'assistant' || entry.isApiErrorMessage === true || entry.message?.model === SYNTHETIC_MODEL) {
                continue;
            }

            const timestampMs = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN;
            if (Number.isFinite(timestampMs)) {
                return timestampMs;
            }
        }
    } catch {
        return undefined;
    }

    return undefined;
}

// Built per call rather than at import, so the path follows HOME at render time.
// The payload's 5-hour percent, which wins over the usage API's, dates from its
// session's last response; the API's counts as seen now.
export function getDefaultSessionUsageHistoryDeps(payload?: StatusJSON): SessionUsageHistoryDeps {
    const isPayloadPercent = typeof payload?.rate_limits?.five_hour?.used_percentage === 'number';
    return {
        readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
        writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
        renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
        unlinkSync: (p: string) => { fs.unlinkSync(p); },
        readdirSync: (p: string) => fs.readdirSync(p),
        statSync: (p: string) => fs.statSync(p),
        mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
        now: () => Date.now(),
        percentSeenAt: isPayloadPercent ? () => getLastResponseAtMs(payload.transcript_path) : undefined,
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

// An unchanged percent was seen again when it was observed, which can be well
// before now: an idle session's refresh renders repeat its last response's.
// The stretch since stays a gap, which the forecast spreads a change across
// (usage on another device, say) rather than taking the percent as unchanged
// until now. With no time for it (a new transcript after /clear has no
// response yet), the reading's own last sighting stands.
function getUnchangedSeenAtMs(deps: SessionUsageHistoryDeps, nowMs: number, lastSeenMs: number): number {
    if (!deps.percentSeenAt) {
        return nowMs;
    }

    const seenAtMs = deps.percentSeenAt();
    return seenAtMs !== undefined && Number.isFinite(seenAtMs) ? Math.min(nowMs, seenAtMs) : lastSeenMs;
}

// Removes the history's temp files that other renders left a minute or more
// ago. A held handle that fails a rename can fail its unlink too, and builds
// from before that unlink left theirs, so while the handle is held at most a
// minute's worth stays.
function removeOrphanedTempFiles(deps: SessionUsageHistoryDeps, nowMs: number): void {
    const dir = path.dirname(deps.cachePath);
    const prefix = `${path.basename(deps.cachePath)}.`;
    let names: string[];
    try {
        names = deps.readdirSync(dir);
    } catch {
        return;
    }

    for (const name of names) {
        if (!name.startsWith(prefix) || !/^\d+\.tmp$/.test(name.slice(prefix.length))) {
            continue;
        }

        const tempPath = path.join(dir, name);
        try {
            if (nowMs - deps.statSync(tempPath).mtimeMs >= ORPHANED_TEMP_FILE_AGE_MS) {
                deps.unlinkSync(tempPath);
            }
        } catch {
            // Gone already, or still held; a later write tries again.
        }
    }
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
    } else if (nowMs - last[1] < LAST_SEEN_WRITE_INTERVAL_MS) {
        // Not even now is a minute past the last sighting, so there's no need
        // to look up when the percent was seen
        return readings;
    } else {
        const seenAtMs = getUnchangedSeenAtMs(deps, nowMs, last[1]);
        if (seenAtMs - last[1] < LAST_SEEN_WRITE_INTERVAL_MS) {
            return readings;
        }

        last[1] = seenAtMs;
    }

    const tempPath = `${deps.cachePath}.${process.pid}.tmp`;
    try {
        deps.mkdirSync(path.dirname(deps.cachePath));
        const history: SessionUsageHistory = { version: HISTORY_SCHEMA_VERSION, profiles };
        deps.writeFileSync(tempPath, JSON.stringify(history));
        deps.renameSync(tempPath, deps.cachePath);
    } catch {
        // Best-effort history; the status line must render regardless. Every
        // render is a new process with its own temp name, so one left behind by
        // a failed rename (a Windows virus scanner holding it, say) would pile up.
        try {
            deps.unlinkSync(tempPath);
        } catch {
            // Never written, or still held; nothing more to do.
        }
    }

    removeOrphanedTempFiles(deps, nowMs);

    return readings;
}
