import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';

import type {
    DailyStateDeps,
    SessionDayRecord
} from './daily-state';
import {
    previousUtcDayKey,
    readDailyState,
    updateDailyState,
    utcDayKey
} from './daily-state';

// Claude Code reports each session's cost and time as running totals, so
// today's share of a session is its current totals minus where they stood when
// the UTC day began: the last totals seen yesterday for a session that ran on
// overnight, otherwise the first totals seen today, which are zero for a new
// session. Its clock time counts from when those totals were first seen.
//
// The totals don't always carry on from the ones recorded. Claude Code
// restores a resumed or forked session's totals, backdating its start by the
// time it ran before, and a /login sets them back to zero under the same
// session id. The session then counts from its new totals as first seen, and a
// run recorded earlier today is kept, so what it counted still counts.

/** One session's running totals from the status payload. */
export interface SessionSample {
    cost: number;
    apiMs: number;
    durationMs: number;
}

/** Today's totals across a Claude Code profile's sessions. */
export interface DailyCostTotals {
    claudeCodeCost: number;
    /** Time Claude spent working; parallel sessions add up. */
    activeMs: number;
    /** Wall-clock time any session was running, counted once. */
    clockMs: number;
}

// Totals unchanged for less than this aren't written again, so idle renders
// don't rewrite the file while clock time still stays current.
const REFRESH_UNCHANGED_MS = 60 * 1000;

// A session's start, worked out from the duration Claude Code read a moment
// before the render, wobbles a little from render to render.
const START_TOLERANCE_MS = 60 * 1000;

// A small step back of the clock, such as an NTP correction, leaves times just
// ahead of now; those are real.
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

function utcMidnight(nowMs: number): number {
    const now = new Date(nowMs);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whether a session's totals carry on from its record: neither went down, and the session's start didn't move later. */
function carriesOn(record: SessionDayRecord, sample: SessionSample, nowMs: number): boolean {
    return sample.cost >= record.cost
        && sample.apiMs >= record.apiMs
        && nowMs - sample.durationMs <= record.startedAt + START_TOLERANCE_MS;
}

/** Folds one status payload's totals into a session's record. */
export function advanceSessionRecord(record: SessionDayRecord | undefined, sample: SessionSample, nowMs: number): SessionDayRecord {
    const today = utcDayKey(nowMs);
    const seen = { lastSeenDay: today, lastSeenAt: nowMs, cost: sample.cost, apiMs: sample.apiMs };

    if (record && carriesOn(record, sample, nowMs)) {
        if (record.lastSeenDay === today) {
            return { ...record, ...seen };
        }
        if (record.lastSeenDay === previousUtcDayKey(nowMs)) {
            return { ...record, ...seen, dayFirstSeenAt: nowMs, dayStartCost: record.cost, dayStartApiMs: record.apiMs };
        }
    }
    return {
        ...seen,
        startedAt: nowMs - sample.durationMs,
        firstSeenAt: nowMs,
        dayFirstSeenAt: nowMs,
        dayStartCost: sample.cost,
        dayStartApiMs: sample.apiMs
    };
}

// A session's run recorded today that its totals no longer carry on from is
// kept under `<session id>@<time last seen>`, so what it counted still counts.
function foldSessionSample(sessions: Record<string, SessionDayRecord>, sessionId: string, sample: SessionSample, nowMs: number): Record<string, SessionDayRecord> {
    const current = sessions[sessionId];
    const next = advanceSessionRecord(current, sample, nowMs);
    if (current?.lastSeenDay === utcDayKey(nowMs) && !carriesOn(current, sample, nowMs)) {
        return { ...sessions, [`${sessionId}@${current.lastSeenAt}`]: current, [sessionId]: next };
    }
    return { ...sessions, [sessionId]: next };
}

function unionLength(intervals: [number, number][]): number {
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    let total = 0;
    let currentStart: number | null = null;
    let currentEnd = 0;

    for (const [start, end] of sorted) {
        if (currentStart === null || start > currentEnd) {
            if (currentStart !== null) {
                total += currentEnd - currentStart;
            }
            currentStart = start;
            currentEnd = end;
        } else {
            currentEnd = Math.max(currentEnd, end);
        }
    }
    if (currentStart !== null) {
        total += currentEnd - currentStart;
    }
    return total;
}

/** Today's totals across the sessions seen today. */
export function computeDailyTotals(sessions: Record<string, SessionDayRecord>, nowMs: number): DailyCostTotals {
    const today = utcDayKey(nowMs);
    const midnight = utcMidnight(nowMs);
    let claudeCodeCost = 0;
    let activeMs = 0;
    const intervals: [number, number][] = [];

    for (const record of Object.values(sessions)) {
        if (record.lastSeenDay !== today) {
            continue;
        }

        claudeCodeCost += Math.max(0, record.cost - record.dayStartCost);
        activeMs += Math.max(0, record.apiMs - record.dayStartApiMs);
        const start = Math.max(record.firstSeenAt, midnight);
        if (record.lastSeenAt > start) {
            intervals.push([start, record.lastSeenAt]);
        }
    }

    return { claudeCodeCost, activeMs, clockMs: unionLength(intervals) };
}

// A record last seen further ahead was stamped while the system clock ran
// ahead. If it was first seen today, at a time that has come, today's starting
// point was taken then and stands: only the time it was last seen is off, so it
// counts as last seen now. Otherwise its day can't be trusted either, and it
// would count towards a later day once that came, so it's dropped.
function settleRecordsAhead(sessions: Record<string, SessionDayRecord>, nowMs: number): Record<string, SessionDayRecord> {
    const latestTrusted = nowMs + CLOCK_SKEW_TOLERANCE_MS;
    const entries = Object.entries(sessions);
    if (entries.every(([, record]) => record.lastSeenAt <= latestTrusted)) {
        return sessions;
    }

    const today = utcDayKey(nowMs);
    const settled: Record<string, SessionDayRecord> = {};
    for (const [key, record] of entries) {
        if (record.lastSeenAt <= latestTrusted) {
            settled[key] = record;
        } else if (record.lastSeenDay === today && record.dayFirstSeenAt <= latestTrusted) {
            settled[key] = { ...record, lastSeenAt: nowMs };
        }
    }
    return settled;
}

function isUnchanged(current: SessionDayRecord, next: SessionDayRecord): boolean {
    return current.lastSeenDay === next.lastSeenDay
        && current.firstSeenAt === next.firstSeenAt
        && current.cost === next.cost
        && current.apiMs === next.apiMs
        && next.lastSeenAt - current.lastSeenAt < REFRESH_UNCHANGED_MS;
}

/**
 * Records a session's totals under its Claude Code profile and returns today's
 * totals across that profile's sessions. When another ccstatusline process
 * holds the state lock, this sample isn't stored, but it still counts.
 */
export function observeSessionCost(profileKey: string, sessionId: string, sample: SessionSample, deps?: DailyStateDeps): DailyCostTotals {
    const nowMs = deps ? deps.now() : Date.now();
    const result: { sessions?: Record<string, SessionDayRecord> } = {};

    const ran = updateDailyState((state) => {
        const stored = state.sessions[profileKey] ?? {};
        const profile = settleRecordsAhead(stored, nowMs);
        const current = profile[sessionId];
        const sessions = foldSessionSample(profile, sessionId, sample, nowMs);
        result.sessions = sessions;
        const next = sessions[sessionId];
        if (profile === stored && current && next && isUnchanged(current, next)) {
            return null;
        }
        return { ...state, sessions: { ...state.sessions, [profileKey]: sessions } };
    }, deps);

    if (!ran || !result.sessions) {
        const profile = settleRecordsAhead(readDailyState(deps).sessions[profileKey] ?? {}, nowMs);
        result.sessions = foldSessionSample(profile, sessionId, sample, nowMs);
    }
    return computeDailyTotals(result.sessions, nowMs);
}

// Sessions belong to a Claude Code profile: a CLAUDE_CONFIG_DIR profile (a
// second login, say) keeps its own daily totals.
function getProfileKey(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
    return configDir && configDir.length > 0 ? configDir : 'default';
}

/**
 * Records this render's session totals and returns today's totals for its
 * profile, when a line shows Daily Cost Rate and the payload carries the
 * session id, cost and both durations. Otherwise records nothing.
 */
export function prefetchDailyCostIfNeeded(lines: WidgetItem[][], data: StatusJSON | undefined, deps?: DailyStateDeps): DailyCostTotals | null {
    if (!lines.some(line => line.some(item => item.type === 'daily-cost-rate'))) {
        return null;
    }

    const sessionId = data?.session_id;
    const cost = data?.cost;
    if (!sessionId || cost?.total_cost_usd === undefined || cost.total_api_duration_ms === undefined || cost.total_duration_ms === undefined) {
        return null;
    }

    return observeSessionCost(getProfileKey(), sessionId, {
        cost: cost.total_cost_usd,
        apiMs: cost.total_api_duration_ms,
        durationMs: cost.total_duration_ms
    }, deps);
}
