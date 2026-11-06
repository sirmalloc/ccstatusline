import * as fs from 'fs';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    advanceSpendRecord,
    getSpentToday,
    observeExtraUsageSpend
} from '../daily-spend';
import type {
    DailyStateDeps,
    SpendDayRecord
} from '../daily-state';
import { readDailyState } from '../daily-state';

const STATE_PATH = `/tmp/test-daily-spend-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${STATE_PATH}.lock`;

// Monday 5 October 2026, 15:00 UTC.
const NOW = Date.parse('2026-10-05T15:00:00Z');

function makeDeps(initial: object | null, now = NOW): DailyStateDeps & { writes: number } {
    const files = new Map<string, string>();
    if (initial !== null) {
        files.set(STATE_PATH, JSON.stringify(initial));
    }

    const deps = {
        writes: 0,
        statePath: STATE_PATH,
        now: () => now,
        mkdirSync: () => undefined,
        readFileSync: (p: string) => {
            const content = files.get(p);
            if (content === undefined) {
                throw new Error('ENOENT');
            }
            return content;
        },
        writeFileSync: (p: string, data: string) => {
            deps.writes += 1;
            files.set(p, data);
        },
        renameSync: (from: string, to: string) => {
            const data = files.get(from);
            if (data === undefined) {
                throw new Error('ENOENT');
            }
            files.set(to, data);
            files.delete(from);
        }
    };
    return deps;
}

function seen(day: string, baselineUsed: number, lastSeenUsed: number, lastSeenAt = Date.parse(`${day}T12:00:00Z`)): SpendDayRecord {
    return { day, baselineUsed, lastSeenDay: day, lastSeenUsed, lastSeenAt };
}

// One render with the system clock at `clock`, of a total fetched then unless
// the usage cache replays an earlier fetch.
function renderAt(deps: DailyStateDeps, clock: string, used: number, fetchedAtMs = Date.parse(clock)): number | undefined {
    deps.now = () => Date.parse(clock);
    return observeExtraUsageSpend('work', used, fetchedAtMs, deps);
}

describe('advanceSpendRecord', () => {
    it('starts today at the first value seen when there is no earlier record', () => {
        const record = advanceSpendRecord(undefined, 12345, NOW);

        expect(record).toEqual(seen('2026-10-05', 12345, 12345, NOW));
        expect(getSpentToday(record, NOW)).toBe(0);
    });

    it('starts today at the last value seen yesterday', () => {
        const record = advanceSpendRecord(seen('2026-10-04', 5000, 9000), 12345, NOW);

        expect(record).toEqual(seen('2026-10-05', 9000, 12345, NOW));
        expect(getSpentToday(record, NOW)).toBe(3345);
    });

    it('falls back to the first value seen today after a day with nothing seen', () => {
        const record = advanceSpendRecord(seen('2026-10-02', 5000, 8000), 12345, NOW);

        expect(record.baselineUsed).toBe(12345);
        expect(getSpentToday(record, NOW)).toBe(0);
    });

    // Extra usage resets at 00:00 UTC on the 1st, so last month's total is
    // never today's starting point.
    it('starts the 1st of the month at zero', () => {
        const firstOfMonth = Date.parse('2026-11-01T00:05:00Z');

        const afterLastMonth = advanceSpendRecord(seen('2026-10-31', 95000, 99000), 150, firstOfMonth);
        expect(afterLastMonth).toEqual(seen('2026-11-01', 0, 150, firstOfMonth));
        expect(getSpentToday(afterLastMonth, firstOfMonth)).toBe(150);

        expect(advanceSpendRecord(undefined, 150, firstOfMonth).baselineUsed).toBe(0);
    });

    it('keeps the starting point through the day', () => {
        const record = advanceSpendRecord(seen('2026-10-05', 12345, 12345), 12800, NOW);

        expect(record).toEqual(seen('2026-10-05', 12345, 12800, NOW));
        expect(getSpentToday(record, NOW)).toBe(455);
    });

    it('never reports negative spend when the month-to-date total drops', () => {
        const record = advanceSpendRecord(seen('2026-10-05', 12345, 12345), 9000, NOW);

        expect(record.baselineUsed).toBe(9000);
        expect(getSpentToday(record, NOW)).toBe(0);
    });

    // Concurrent renders can replay an older cached fetch after a newer one was
    // recorded; the older value must not move the record back.
    it('ignores an observation fetched before the one already stored', () => {
        const stored = seen('2026-10-05', 12345, 12800, NOW);

        expect(advanceSpendRecord(stored, 12500, NOW - 3 * 60 * 1000)).toEqual(stored);
        expect(advanceSpendRecord(stored, 12500, Date.parse('2026-10-04T23:58:00Z'))).toEqual(stored);
    });
});

describe('getSpentToday', () => {
    it('has nothing for a record from an earlier day', () => {
        expect(getSpentToday(seen('2026-10-04', 5000, 9000), NOW)).toBeUndefined();
        expect(getSpentToday(undefined, NOW)).toBeUndefined();
    });
});

describe('observeExtraUsageSpend', () => {
    afterEach(() => {
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('keeps a separate record per login', () => {
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-04', 5000, 9000) } });

        expect(observeExtraUsageSpend('work', 12345, NOW, deps)).toBe(3345);
        expect(observeExtraUsageSpend('personal', 300, NOW, deps)).toBe(0);

        expect(readDailyState(deps).spend).toEqual({
            work: seen('2026-10-05', 9000, 12345, NOW),
            personal: seen('2026-10-05', 300, 300, NOW)
        });
    });

    // A record is kept under the login's token fingerprint until the profile
    // lookup names its account, and builds before that lookup only ever kept
    // it there. The token fingerprint changes with every token refresh, so
    // once the account is known, the record moves over to it.
    it('carries a record over from the login\'s token fingerprint to its account, once', () => {
        const deps = makeDeps({
            version: 1,
            spend: {
                'refresh-a': seen('2026-10-05', 10000, 11500, Date.parse('2026-10-05T13:00:00Z')),
                'personal': seen('2026-10-05', 300, 300)
            }
        });

        expect(observeExtraUsageSpend('account:work', 13500, NOW, deps, ['refresh-b', 'refresh-a'])).toBe(3500);
        expect(readDailyState(deps).spend).toEqual({
            'account:work': seen('2026-10-05', 10000, 13500, NOW),
            'personal': seen('2026-10-05', 300, 300)
        });

        const writes = deps.writes;
        expect(observeExtraUsageSpend('account:work', 13500, NOW, deps, ['refresh-b', 'refresh-a'])).toBe(3500);
        expect(deps.writes).toBe(writes);
    });

    it('starts today from the last total a fingerprint record saw yesterday', () => {
        const deps = makeDeps({ version: 1, spend: { 'refresh-a': seen('2026-10-04', 5000, 9000) } });

        expect(observeExtraUsageSpend('account:work', 12345, NOW, deps, ['refresh-a'])).toBe(3345);
    });

    // A render that couldn't look up the account (the lookup failed, or
    // another render's was in flight) started a record of its own under the
    // new fingerprint; the account's record keeps the day's starting point.
    it('keeps the account\'s starting point over a fingerprint record started later', () => {
        const deps = makeDeps({
            version: 1,
            spend: {
                'account:work': seen('2026-10-05', 10000, 11500, Date.parse('2026-10-05T13:00:00Z')),
                'refresh-b': seen('2026-10-05', 13500, 13500, Date.parse('2026-10-05T14:00:00Z'))
            }
        });

        expect(observeExtraUsageSpend('account:work', 14500, NOW, deps, ['refresh-b'])).toBe(4500);
        expect(readDailyState(deps).spend).toEqual({ 'account:work': seen('2026-10-05', 10000, 14500, NOW) });
    });

    // A fingerprint record seen while the clock ran ahead is dropped, as it
    // would be under its own key; carried over, it would take the account's
    // starting point down with it.
    it('drops a fingerprint record from a clock that ran ahead, keeping the account\'s starting point', () => {
        const deps = makeDeps({
            version: 1,
            spend: {
                'account:work': seen('2026-10-05', 10000, 11500, Date.parse('2026-10-05T13:00:00Z')),
                'refresh-b': seen('2026-10-05', 12000, 12000, NOW + 60 * 60 * 1000)
            }
        });

        expect(observeExtraUsageSpend('account:work', 13500, NOW, deps, ['refresh-b'])).toBe(3500);
        expect(readDailyState(deps).spend).toEqual({ 'account:work': seen('2026-10-05', 10000, 13500, NOW) });
    });

    it('writes nothing when the same fetch is observed again', () => {
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-05', 9000, 12345, NOW) } });

        expect(observeExtraUsageSpend('work', 12345, NOW, deps)).toBe(3345);
        expect(deps.writes).toBe(0);
    });

    it('still reports today\'s spend when another writer holds the lock', () => {
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-04', 5000, 9000) } });
        fs.writeFileSync(LOCK_PATH, '');

        expect(observeExtraUsageSpend('work', 12345, NOW, deps)).toBe(3345);
        expect(deps.writes).toBe(0);
    });

    // The usage cache is reused for up to three minutes, and a stale copy is
    // served while the API is unreachable. A value fetched yesterday is
    // yesterday's, even when it's rendered after midnight.
    it('records a value fetched before midnight as yesterday\'s, showing nothing for today yet', () => {
        const justAfterMidnight = Date.parse('2026-10-05T00:01:00Z');
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-04', 5000, 11000, Date.parse('2026-10-04T23:50:00Z')) } }, justAfterMidnight);

        expect(observeExtraUsageSpend('work', 12000, Date.parse('2026-10-04T23:58:00Z'), deps)).toBeUndefined();
        expect(readDailyState(deps).spend.work).toEqual(seen('2026-10-04', 5000, 12000, Date.parse('2026-10-04T23:58:00Z')));
    });

    it('never shows last month\'s total as the 1st of the month\'s spend', () => {
        const lastFetchOfMonth = Date.parse('2026-10-31T23:58:00Z');
        const deps = makeDeps({ version: 1, spend: { work: seen('2026-10-31', 95000, 99000, lastFetchOfMonth) } }, Date.parse('2026-11-01T00:01:00Z'));

        // The cache from 23:58 replayed at 00:01: nothing for the 1st yet.
        expect(observeExtraUsageSpend('work', 99000, lastFetchOfMonth, deps)).toBeUndefined();
        // The first fresh fetch of the month.
        expect(observeExtraUsageSpend('work', 150, Date.parse('2026-11-01T00:01:00Z'), deps)).toBe(150);
    });

    // A render whose system clock runs a day ahead stores a record seen at a
    // time that hasn't come yet. Once the clock is put right, that record must
    // neither hide today's spend nor become the next day's starting point.
    it('starts afresh after a render whose clock ran ahead', () => {
        const deps = makeDeps(null);

        expect(renderAt(deps, '2026-10-07T09:00:00Z', 1000)).toBe(0);
        expect(renderAt(deps, '2026-10-08T09:00:00Z', 1500)).toBe(500);
        // The clock is put right.
        expect(renderAt(deps, '2026-10-07T12:05:00Z', 2500)).toBe(0);
        expect(renderAt(deps, '2026-10-07T20:00:00Z', 4000)).toBe(1500);
        expect(renderAt(deps, '2026-10-08T13:00:00Z', 5000)).toBe(1000);
    });

    // The usage cache that render wrote is stamped by the same clock, and is
    // replayed at that time until the clock catches up with it.
    it('records nothing fetched later than now', () => {
        const deps = makeDeps(null);
        const fetchedAhead = Date.parse('2026-10-08T09:00:00Z');

        expect(renderAt(deps, '2026-10-07T09:00:00Z', 1000)).toBe(0);
        expect(renderAt(deps, '2026-10-08T09:00:00Z', 1500)).toBe(500);
        // The clock is put right.
        expect(renderAt(deps, '2026-10-07T12:05:00Z', 1500, fetchedAhead)).toBeUndefined();
        expect(renderAt(deps, '2026-10-07T20:00:00Z', 1500, fetchedAhead)).toBeUndefined();
        expect(renderAt(deps, '2026-10-08T09:05:00Z', 4500)).toBe(0);
        expect(renderAt(deps, '2026-10-08T13:00:00Z', 5000)).toBe(500);
    });

    // A small step back, such as an NTP correction just after a fetch was
    // recorded, isn't a clock that ran ahead: the day keeps its starting point.
    it('keeps a record a few seconds ahead of now', () => {
        const stored = seen('2026-10-05', 9000, 12800, NOW + 5000);
        const deps = makeDeps({ version: 1, spend: { work: stored } });

        expect(observeExtraUsageSpend('work', 12700, NOW, deps)).toBe(3800);
        expect(readDailyState(deps).spend.work).toEqual(stored);
    });

    // Another render can store a newer fetch while this one is held up on its
    // way to the state file (say the machine slept); that record is not from
    // the future.
    it('keeps a newer fetch another render stored after this one began', () => {
        const newer = seen('2026-10-05', 9000, 12800, NOW + 2 * 60 * 1000);
        const deps = makeDeps({ version: 1, spend: { work: newer } });
        const { readFileSync } = deps;
        deps.readFileSync = (p: string) => {
            deps.now = () => NOW + 3 * 60 * 1000;
            return readFileSync(p);
        };

        expect(observeExtraUsageSpend('work', 12500, NOW - 60 * 1000, deps)).toBe(3800);
        expect(readDailyState(deps).spend.work).toEqual(newer);
    });
});
