import type {
    DailyState,
    DailyStateDeps,
    SpendDayRecord
} from './daily-state';
import {
    previousUtcDayKey,
    readDailyState,
    updateDailyState,
    utcDayKey
} from './daily-state';

// The usage API only reports extra usage spent month to date, so today's spend
// is that total minus where it stood when the UTC day began. ccstatusline only
// sees the total while Claude Code is running, so the start of the day is
// estimated from what it did see:
//   - the last value seen during the previous UTC day, which is at most the
//     total at midnight;
//   - zero on the 1st of the month, which is exact: extra usage resets at
//     00:00 UTC on the 1st;
//   - otherwise the first value seen today, which misses any spend before it.

/**
 * Folds one observation of the month-to-date total (cents) into a login's
 * record. `fetchedAtMs` is when the usage API returned the total, not when it
 * was rendered: the usage cache replays a fetch for up to three minutes and
 * serves a stale one while the API is unreachable, and a total fetched before
 * midnight belongs to the day before.
 */
export function advanceSpendRecord(record: SpendDayRecord | undefined, used: number, fetchedAtMs: number): SpendDayRecord {
    // Concurrent renders can replay an older fetch after a newer one was
    // recorded; it must not move the record back.
    if (record && fetchedAtMs < record.lastSeenAt) {
        return record;
    }

    const day = utcDayKey(fetchedAtMs);
    const seen = { lastSeenDay: day, lastSeenUsed: used, lastSeenAt: fetchedAtMs };
    if (record?.day === day) {
        // A total that drops mid-day (a refund, an admin reset) moves the
        // starting point down with it, so today's spend never goes negative.
        return { ...record, ...seen, baselineUsed: Math.min(record.baselineUsed, used) };
    }

    let baselineUsed = used;
    const seenDayBeforeThisMonth = record?.lastSeenDay === previousUtcDayKey(fetchedAtMs)
        && record.lastSeenDay.slice(0, 7) === day.slice(0, 7);
    if (seenDayBeforeThisMonth) {
        baselineUsed = Math.min(record.lastSeenUsed, used);
    } else if (day.endsWith('-01')) {
        baselineUsed = 0;
    }

    return { day, baselineUsed, ...seen };
}

/** Extra usage spent today (cents), or undefined when the record isn't today's. */
export function getSpentToday(record: SpendDayRecord | undefined, nowMs: number): number | undefined {
    if (record?.day !== utcDayKey(nowMs)) {
        return undefined;
    }
    return Math.max(0, record.lastSeenUsed - record.baselineUsed);
}

// A small step back of the clock, such as an NTP correction, leaves times just
// ahead of now; those are real and mustn't drop the day's starting point.
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

// A time further ahead was stamped while the system clock ran ahead. A record
// last seen then would hide every real fetch until the clock caught up, and
// then start that day from the day before's figures; a fetch stamped then (the
// usage cache written then replays at that time) can't be placed on a day.
// Such a record is dropped, and such a fetch isn't recorded.
function advanceAsOf(record: SpendDayRecord | undefined, used: number, fetchedAtMs: number, nowMs: number): SpendDayRecord | undefined {
    const latestTrusted = nowMs + CLOCK_SKEW_TOLERANCE_MS;
    const trusted = record !== undefined && record.lastSeenAt <= latestTrusted ? record : undefined;
    return fetchedAtMs > latestTrusted ? trusted : advanceSpendRecord(trusted, used, fetchedAtMs);
}

function isSameRecord(a: SpendDayRecord, b: SpendDayRecord): boolean {
    return a.day === b.day
        && a.baselineUsed === b.baselineUsed
        && a.lastSeenDay === b.lastSeenDay
        && a.lastSeenUsed === b.lastSeenUsed
        && a.lastSeenAt === b.lastSeenAt;
}

// Folds one of a login's records into another, as the observation behind it
// would have; a record's own starting point counts for its day too.
function mergeSpendRecord(merged: SpendDayRecord | undefined, record: SpendDayRecord): SpendDayRecord {
    if (!merged) {
        return record;
    }

    const next = advanceSpendRecord(merged, record.lastSeenUsed, record.lastSeenAt);
    return next.day === record.day ? { ...next, baselineUsed: Math.min(next.baselineUsed, record.baselineUsed) } : next;
}

// Until the profile lookup names a login's account, its record is kept under
// its token fingerprint, which changes each time Claude Code refreshes its
// tokens. Once the account is known, the records under its fingerprints move
// into the account's record, oldest first, so the day keeps its starting
// point. A record seen while the clock ran ahead is dropped, as advanceAsOf
// drops it, rather than carried into the account's: its time would make
// advanceAsOf drop the merged record. Returns `state` itself when there is
// nothing to move.
function adoptFormerRecords(state: DailyState, accountKey: string, formerKeys: readonly string[], nowMs: number): DailyState {
    const moved = formerKeys.filter(key => key !== accountKey && state.spend[key] !== undefined);
    if (moved.length === 0) {
        return state;
    }

    const merged = [accountKey, ...moved]
        .map(key => state.spend[key])
        .filter((record): record is SpendDayRecord => record !== undefined && record.lastSeenAt <= nowMs + CLOCK_SKEW_TOLERANCE_MS)
        .sort((a, b) => a.lastSeenAt - b.lastSeenAt)
        .reduce<SpendDayRecord | undefined>((merged, record) => mergeSpendRecord(merged, record), undefined);
    const kept = Object.fromEntries(Object.entries(state.spend).filter(([key]) => !moved.includes(key)));
    return { ...state, spend: merged ? { ...kept, [accountKey]: merged } : kept };
}

/**
 * Records the month-to-date total (cents) a login's usage fetch returned at
 * `fetchedAtMs`, and returns the extra usage spent today, or undefined until a
 * total fetched today has been seen. When another ccstatusline process holds
 * the state lock, this observation isn't stored, but today's spend is still
 * worked out from it. `formerKeys` are the other keys the login's records may
 * be under (its token fingerprints); their records move to `accountKey`.
 */
export function observeExtraUsageSpend(accountKey: string, used: number, fetchedAtMs: number, deps?: DailyStateDeps, formerKeys: readonly string[] = []): number | undefined {
    // Read after the state each time, so a fetch another render has just
    // recorded is never taken for one from the future.
    const now = () => (deps ? deps.now() : Date.now());
    const result: { record?: SpendDayRecord } = {};

    const ran = updateDailyState((stored) => {
        const state = adoptFormerRecords(stored, accountKey, formerKeys, now());
        const current = state.spend[accountKey];
        const next = advanceAsOf(current, used, fetchedAtMs, now());
        result.record = next;
        if (state === stored && (current === next || (current && next && isSameRecord(current, next)))) {
            return null;
        }
        if (next) {
            return { ...state, spend: { ...state.spend, [accountKey]: next } };
        }
        // The stored record was dropped, and there's nothing to replace it.
        return { ...state, spend: Object.fromEntries(Object.entries(state.spend).filter(([key]) => key !== accountKey)) };
    }, deps);

    if (!ran || !result.record) {
        const stored = adoptFormerRecords(readDailyState(deps), accountKey, formerKeys, now()).spend[accountKey];
        result.record = advanceAsOf(stored, used, fetchedAtMs, now());
    }
    return getSpentToday(result.record, now());
}
