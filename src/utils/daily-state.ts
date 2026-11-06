import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { withCacheLock } from './cache-lock';

// Day-by-day usage state that has to survive between status line renders and
// across Claude Code sessions. Modeled on terminal-width-cache.ts: one JSON
// file, a best-effort lock around each read-modify-write, atomic writes, and
// injected dependencies so tests never touch the real home directory.

const STATE_VERSION = 1 as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Month-to-date extra usage spend (cents) at the start of a UTC day, and the latest value seen. */
export interface SpendDayRecord {
    day: string;
    baselineUsed: number;
    lastSeenDay: string;
    lastSeenUsed: number;
    /** When the last value seen was fetched from the usage API. */
    lastSeenAt: number;
}

/** A Claude Code session's cumulative cost and time, and where they stood when the UTC day began. */
export interface SessionDayRecord {
    lastSeenDay: string;
    lastSeenAt: number;
    /** When the session started, going by its duration. */
    startedAt: number;
    /** When the session was first seen, or seen again after Claude Code restarted its totals; its clock time counts from then. */
    firstSeenAt: number;
    /** When it was first seen, or seen again after a restart, on the day it was last seen; that day's starting point was taken then. */
    dayFirstSeenAt: number;
    cost: number;
    apiMs: number;
    dayStartCost: number;
    dayStartApiMs: number;
}

export interface DailyState {
    version: typeof STATE_VERSION;
    /** Keyed by the login's account, or its token fingerprint until the account is known, so accounts never mix. */
    spend: Record<string, SpendDayRecord>;
    /** Keyed by Claude Code profile (its CLAUDE_CONFIG_DIR), then by session id. */
    sessions: Record<string, Record<string, SessionDayRecord>>;
}

export interface DailyStateDeps {
    readFileSync: (path: string) => string;
    writeFileSync: (path: string, data: string) => void;
    renameSync: (from: string, to: string) => void;
    /** Removes the temp file a failed write leaves; a test double whose writes never fail can leave it out. */
    unlinkSync?: (path: string) => void;
    /** With statSync and unlinkSync, finds earlier writes' leftover temp files to remove; optional like unlinkSync. */
    readdirSync?: (path: string) => string[];
    statSync?: (path: string) => { mtimeMs: number };
    mkdirSync: (path: string) => void;
    now: () => number;
    statePath: string;
}

const defaultDeps: DailyStateDeps = {
    readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
    writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
    renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
    unlinkSync: (p: string) => { fs.unlinkSync(p); },
    readdirSync: (p: string) => fs.readdirSync(p),
    statSync: (p: string) => fs.statSync(p),
    mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
    now: () => Date.now(),
    statePath: path.join(os.homedir(), '.cache', 'ccstatusline', 'daily.json')
};

/** The UTC calendar day of a timestamp, as `YYYY-MM-DD`. */
export function utcDayKey(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
}

/** The UTC calendar day before the one containing a timestamp. */
export function previousUtcDayKey(nowMs: number): string {
    return utcDayKey(nowMs - DAY_MS);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isSpendDayRecord(value: unknown): value is SpendDayRecord {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return typeof entry.day === 'string'
        && isFiniteNumber(entry.baselineUsed)
        && typeof entry.lastSeenDay === 'string'
        && isFiniteNumber(entry.lastSeenUsed)
        && isFiniteNumber(entry.lastSeenAt);
}

function isSessionDayRecord(value: unknown): value is SessionDayRecord {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return typeof entry.lastSeenDay === 'string'
        && isFiniteNumber(entry.lastSeenAt)
        && isFiniteNumber(entry.startedAt)
        && isFiniteNumber(entry.firstSeenAt)
        && isFiniteNumber(entry.dayFirstSeenAt)
        && isFiniteNumber(entry.cost)
        && isFiniteNumber(entry.apiMs)
        && isFiniteNumber(entry.dayStartCost)
        && isFiniteNumber(entry.dayStartApiMs);
}

function readSessions(value: unknown): DailyState['sessions'] {
    const sessions: DailyState['sessions'] = {};
    if (typeof value !== 'object' || value === null) {
        return sessions;
    }

    for (const [profileKey, profile] of Object.entries(value as Record<string, unknown>)) {
        if (typeof profile !== 'object' || profile === null) {
            continue;
        }

        const records: Record<string, SessionDayRecord> = {};
        for (const [sessionId, record] of Object.entries(profile)) {
            if (isSessionDayRecord(record)) {
                records[sessionId] = record;
            }
        }
        sessions[profileKey] = records;
    }
    return sessions;
}

function emptyState(): DailyState {
    return { version: STATE_VERSION, spend: {}, sessions: {} };
}

/** Reads the state file. A missing or corrupt file, or an invalid record, reads as absent; never throws. */
export function readDailyState(deps: DailyStateDeps = defaultDeps): DailyState {
    try {
        const parsed = JSON.parse(deps.readFileSync(deps.statePath)) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return emptyState();
        }

        const data = parsed as { version?: unknown; spend?: unknown; sessions?: unknown };
        if (data.version !== STATE_VERSION || typeof data.spend !== 'object' || data.spend === null) {
            return emptyState();
        }

        const spend: Record<string, SpendDayRecord> = {};
        for (const [key, value] of Object.entries(data.spend)) {
            if (isSpendDayRecord(value)) {
                spend[key] = value;
            }
        }

        return { version: STATE_VERSION, spend, sessions: readSessions(data.sessions) };
    } catch {
        return emptyState();
    }
}

// Only today and yesterday are ever needed: a day's starting point comes from
// the previous day at most.
function prune(state: DailyState, nowMs: number): DailyState {
    const oldestKept = previousUtcDayKey(nowMs);
    const spend = Object.fromEntries(
        Object.entries(state.spend).filter(([, entry]) => entry.lastSeenDay >= oldestKept)
    );
    const sessions: DailyState['sessions'] = {};
    for (const [profileKey, profile] of Object.entries(state.sessions)) {
        const kept = Object.fromEntries(
            Object.entries(profile).filter(([, entry]) => entry.lastSeenDay >= oldestKept)
        );
        if (Object.keys(kept).length > 0) {
            sessions[profileKey] = kept;
        }
    }
    return { ...state, spend, sessions };
}

// Another write's temp file this old has been left behind, not still being
// written, so a write removes it.
const ORPHANED_TEMP_FILE_AGE_MS = 60 * 1000;

// Removes the state file's temp files that other writes left a minute or more
// ago. A held handle (a Windows virus scanner or sync client) that fails a
// rename can fail its unlink too, and builds from before that unlink left
// theirs, so while the handle is held at most a minute's worth stays.
function removeOrphanedTempFiles(deps: DailyStateDeps, nowMs: number): void {
    const { readdirSync, statSync, unlinkSync } = deps;
    if (!readdirSync || !statSync || !unlinkSync) {
        return;
    }

    const dir = path.dirname(deps.statePath);
    const prefix = `${path.basename(deps.statePath)}.`;
    let names: string[];
    try {
        names = readdirSync(dir);
    } catch {
        return;
    }

    for (const name of names) {
        if (!name.startsWith(prefix) || !/^\d+\.tmp$/.test(name.slice(prefix.length))) {
            continue;
        }

        const tempPath = path.join(dir, name);
        try {
            if (nowMs - statSync(tempPath).mtimeMs >= ORPHANED_TEMP_FILE_AGE_MS) {
                unlinkSync(tempPath);
            }
        } catch {
            // Gone already, or still held; a later write tries again.
        }
    }
}

/**
 * Applies `update` to the current state under the cache lock and writes the
 * result atomically; `null` from `update` means nothing changed and nothing is
 * written. Returns false when another writer held the lock and `update` never
 * ran. Best-effort: never throws.
 */
export function updateDailyState(
    update: (state: DailyState) => DailyState | null,
    deps: DailyStateDeps = defaultDeps
): boolean {
    let ran = false;
    try {
        // The lock file lives next to the state file, so the directory has to
        // exist before the lock can be taken on the very first write.
        deps.mkdirSync(path.dirname(deps.statePath));

        withCacheLock(deps.statePath, () => {
            ran = true;
            const next = update(readDailyState(deps));
            if (next === null) {
                return;
            }

            const tempPath = `${deps.statePath}.${process.pid}.tmp`;
            try {
                deps.writeFileSync(tempPath, JSON.stringify(prune(next, deps.now())));
                deps.renameSync(tempPath, deps.statePath);
            } catch {
                // Every render is a new process with its own temp name, so a
                // temp file kept after each failed write would pile up. A
                // handle held on the temp file itself (a Windows virus
                // scanner or sync client) can refuse this unlink as well as
                // the rename; removeOrphanedTempFiles clears that one later.
                try {
                    deps.unlinkSync?.(tempPath);
                } catch {
                    // Nothing was written, or the file is still held.
                }
            }
            removeOrphanedTempFiles(deps, deps.now());
        });
    } catch {
        // Best-effort state; the status line must render regardless.
    }
    return ran;
}
