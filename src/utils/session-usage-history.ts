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
import {
    getUsageFetchedAtMs,
    getUsageLoginFingerprint
} from './usage';

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
// A render holds the history's lock for a few milliseconds; one this old (or
// dated this far ahead, by a clock since set back) was left by a render that
// died holding it.
const STALE_LOCK_AGE_MS = 10 * 1000;
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
    // Creates an empty file, and fails when there is one already
    createFileExclusiveSync: (path: string) => void;
    renameSync: (from: string, to: string) => void;
    unlinkSync: (path: string) => void;
    readdirSync: (path: string) => string[];
    statSync: (path: string) => { mtimeMs: number };
    mkdirSync: (path: string) => void;
    now: () => number;
    // When the percent given was seen, which can be well before now: a
    // payload's is from its session's last API response, and Claude Code's
    // refresh interval re-renders an idle session with that same percent; the
    // usage API's can come from its cache. Undefined when nothing shows when
    // that was. Left out, the percent is current.
    percentSeenAt?: () => number | undefined;
    // The login the percent belongs to (see getUsageLoginFingerprint), or null
    // when none is found. Left out, the history goes by config directory alone.
    loginFingerprint?: () => string | null;
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
// session's last response; the API's from when the API sent it, which for a
// cached one can be hours ago.
export function getDefaultSessionUsageHistoryDeps(payload?: StatusJSON): SessionUsageHistoryDeps {
    const isPayloadPercent = typeof payload?.rate_limits?.five_hour?.used_percentage === 'number';
    return {
        readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
        writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
        createFileExclusiveSync: (p: string) => { fs.writeFileSync(p, '', { flag: 'wx' }); },
        renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
        unlinkSync: (p: string) => { fs.unlinkSync(p); },
        readdirSync: (p: string) => fs.readdirSync(p),
        statSync: (p: string) => fs.statSync(p),
        mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
        now: () => Date.now(),
        percentSeenAt: isPayloadPercent ? () => getLastResponseAtMs(payload.transcript_path) : getUsageFetchedAtMs,
        loginFingerprint: getUsageLoginFingerprint,
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

// When the percent was observed, which can be well before now: an idle
// session's refresh renders repeat its last response's, and a rate-limited
// usage API leaves its cache's in place. The stretch since stays a gap, which
// the forecast spreads a change across (usage on another device, say) rather
// than taking the percent as unchanged until now. Undefined with no time for
// it (a new transcript after /clear has no response yet). Looked up once per
// render, and only when needed: a payload's means reading the transcript.
function getSeenAtLookup(deps: SessionUsageHistoryDeps, nowMs: number): () => number | undefined {
    let looked = false;
    let seenAtMs: number | undefined;
    return () => {
        if (!looked) {
            looked = true;
            seenAtMs = deps.percentSeenAt ? deps.percentSeenAt() : nowMs;
            seenAtMs = seenAtMs !== undefined && Number.isFinite(seenAtMs) ? Math.min(nowMs, seenAtMs) : undefined;
        }

        return seenAtMs;
    };
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

// Adds the percent to this profile's window in history, which it changes in
// place. Says whether anything changed, so needs writing.
function addReading(
    history: SessionUsageHistory,
    profileKey: string,
    resetAtMs: number,
    percent: number,
    nowMs: number,
    seenAt: () => number | undefined
): { profiles: Record<string, SessionUsageWindow[]>; readings: SessionUsageReading[]; changed: boolean } {
    const profiles: Record<string, SessionUsageWindow[]> = {};
    for (const [key, windows] of Object.entries(history.profiles)) {
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
    if (last !== undefined && percent < last[2]) {
        return { profiles, readings, changed: false };
    }

    if (last?.[2] !== percent) {
        // A new percent can't have been seen before the last one was
        const firstSeenMs = Math.max(seenAt() ?? nowMs, last?.[1] ?? Number.NEGATIVE_INFINITY);
        readings.push([firstSeenMs, firstSeenMs, percent]);
        return { profiles, readings, changed: true };
    }

    // Not even now is a minute past the last sighting, so there's no need to
    // look up when the percent was seen
    if (nowMs - last[1] < LAST_SEEN_WRITE_INTERVAL_MS) {
        return { profiles, readings, changed: false };
    }

    // With no time for the percent, the reading's own last sighting stands
    const lastSeenMs = seenAt() ?? last[1];
    if (lastSeenMs - last[1] < LAST_SEEN_WRITE_INTERVAL_MS) {
        return { profiles, readings, changed: false };
    }

    last[1] = lastSeenMs;
    return { profiles, readings, changed: true };
}

// Taken before a render reads the history to write it, so that two renders
// can't each write over what the other added. Says whether this render holds
// it now.
function lockHistory(deps: SessionUsageHistoryDeps, nowMs: number): boolean {
    const lockPath = `${deps.cachePath}.lock`;
    try {
        deps.mkdirSync(path.dirname(deps.cachePath));
        deps.createFileExclusiveSync(lockPath);
        return true;
    } catch {
        // Held by another render, or left behind by one
    }

    try {
        if (Math.abs(nowMs - deps.statSync(lockPath).mtimeMs) < STALE_LOCK_AGE_MS) {
            return false;
        }

        deps.unlinkSync(lockPath);
        deps.createFileExclusiveSync(lockPath);
        return true;
    } catch {
        return false;
    }
}

function unlockHistory(deps: SessionUsageHistoryDeps): void {
    try {
        deps.unlinkSync(`${deps.cachePath}.lock`);
    } catch {
        // Gone already; nothing more to do.
    }
}

function writeHistory(deps: SessionUsageHistoryDeps, profiles: Record<string, SessionUsageWindow[]>): void {
    const tempPath = `${deps.cachePath}.${process.pid}.tmp`;
    try {
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
}

/**
 * Records the current session percent in this profile's 5-hour window and
 * returns the window's readings for the forecast. Best-effort: a failed write
 * still returns the readings, and nothing here throws.
 *
 * A render that finds another holding the history's lock doesn't wait for it:
 * it forecasts from what it read and leaves the write to a later render. That
 * one records the same percent with the same time, since a reading's time is
 * when its percent was seen rather than when it was written.
 */
export function recordSessionUsageReading(
    profileKey: string,
    resetAtMs: number,
    percent: number,
    deps: SessionUsageHistoryDeps = getDefaultSessionUsageHistoryDeps()
): SessionUsageReading[] {
    const nowMs = deps.now();
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const seenAt = getSeenAtLookup(deps, nowMs);

    const unlocked = addReading(readHistory(deps), profileKey, resetAtMs, clampedPercent, nowMs, seenAt);
    if (!unlocked.changed || !lockHistory(deps, nowMs)) {
        return unlocked.readings;
    }

    try {
        // Read again under the lock, in case another render wrote since
        const locked = addReading(readHistory(deps), profileKey, resetAtMs, clampedPercent, nowMs, seenAt);
        if (locked.changed) {
            writeHistory(deps, locked.profiles);
            removeOrphanedTempFiles(deps, nowMs);
        }

        return locked.readings;
    } finally {
        unlockHistory(deps);
    }
}
