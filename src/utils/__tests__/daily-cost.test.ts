import * as fs from 'node:fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    advanceSessionRecord,
    computeDailyTotals,
    observeSessionCost,
    prefetchDailyCostIfNeeded
} from '../daily-cost';
import type {
    DailyStateDeps,
    SessionDayRecord
} from '../daily-state';
import { readDailyState } from '../daily-state';

const STATE_PATH = `/tmp/test-daily-cost-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${STATE_PATH}.lock`;

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// Monday 5 October 2026, 15:00 UTC.
const NOW = Date.parse('2026-10-05T15:00:00Z');

function at(time: string): number {
    return Date.parse(`2026-10-05T${time}:00Z`);
}

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

function session(overrides: Partial<SessionDayRecord>): SessionDayRecord {
    return {
        lastSeenDay: '2026-10-05',
        lastSeenAt: NOW,
        startedAt: at('14:00'),
        firstSeenAt: at('14:00'),
        dayFirstSeenAt: at('14:00'),
        cost: 2.5,
        apiMs: 30 * MINUTE,
        dayStartCost: 0,
        dayStartApiMs: 0,
        ...overrides
    };
}

// A session that started at 14:00 and was seen then, with nothing spent yet.
function newSession(): SessionDayRecord {
    return session({ cost: 0, apiMs: 0, lastSeenAt: at('14:00') });
}

describe('advanceSessionRecord', () => {
    it('starts a new session at zero', () => {
        expect(advanceSessionRecord(undefined, { cost: 0, apiMs: 0, durationMs: 0 }, at('14:00'))).toEqual(newSession());
    });

    it('starts a session first seen with totals already on it at those totals, and its clock time then', () => {
        // A resumed or forked session: Claude Code restores the totals and
        // backdates the start by the time the session ran before.
        expect(advanceSessionRecord(undefined, { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, NOW))
            .toEqual(session({ firstSeenAt: NOW, dayFirstSeenAt: NOW, dayStartCost: 2.5, dayStartApiMs: 30 * MINUTE }));
    });

    it('starts an overnight session at what it had reached by the end of yesterday', () => {
        const yesterday: SessionDayRecord = {
            lastSeenDay: '2026-10-04',
            lastSeenAt: Date.parse('2026-10-04T23:30:00Z'),
            startedAt: Date.parse('2026-10-04T22:00:00Z'),
            firstSeenAt: Date.parse('2026-10-04T22:00:00Z'),
            dayFirstSeenAt: Date.parse('2026-10-04T22:00:00Z'),
            cost: 1,
            apiMs: 10 * MINUTE,
            dayStartCost: 0,
            dayStartApiMs: 0
        };

        // Started at 22:00 UTC yesterday: 17 hours ago.
        const record = advanceSessionRecord(yesterday, { cost: 3, apiMs: 25 * MINUTE, durationMs: 17 * HOUR }, NOW);

        expect(record.dayStartCost).toBe(1);
        expect(record.dayStartApiMs).toBe(10 * MINUTE);
        expect(record.startedAt).toBe(Date.parse('2026-10-04T22:00:00Z'));
        expect(record.firstSeenAt).toBe(Date.parse('2026-10-04T22:00:00Z'));
        expect(record.dayFirstSeenAt).toBe(NOW);
    });

    it('starts a session seen yesterday and resumed today at the totals Claude Code restored', () => {
        const yesterday: SessionDayRecord = {
            lastSeenDay: '2026-10-04',
            lastSeenAt: Date.parse('2026-10-04T20:00:00Z'),
            startedAt: Date.parse('2026-10-04T18:00:00Z'),
            firstSeenAt: Date.parse('2026-10-04T18:00:00Z'),
            dayFirstSeenAt: Date.parse('2026-10-04T18:00:00Z'),
            cost: 8,
            apiMs: 40 * MINUTE,
            dayStartCost: 0,
            dayStartApiMs: 0
        };

        // Ran 18:00-20:00 yesterday and resumed now: the totals are restored,
        // and the duration carries on from the 2 hours it ran, so the session
        // reads as started at 13:00.
        const record = advanceSessionRecord(yesterday, { cost: 8, apiMs: 40 * MINUTE, durationMs: 2 * HOUR }, NOW);

        expect(record.dayStartCost).toBe(8);
        expect(record.dayStartApiMs).toBe(40 * MINUTE);
        expect(record.firstSeenAt).toBe(NOW);
    });

    it('starts an overnight session first seen today at its current values', () => {
        const record = advanceSessionRecord(undefined, { cost: 3, apiMs: 25 * MINUTE, durationMs: 17 * HOUR }, NOW);

        expect(record.dayStartCost).toBe(3);
        expect(record.dayStartApiMs).toBe(25 * MINUTE);
    });

    it('keeps the day\'s starting values through the day', () => {
        const record = advanceSessionRecord(
            session({ dayStartCost: 1, dayStartApiMs: 10 * MINUTE, lastSeenAt: at('14:30') }),
            { cost: 4, apiMs: 40 * MINUTE, durationMs: HOUR },
            NOW
        );

        expect(record).toEqual(session({ cost: 4, apiMs: 40 * MINUTE, dayStartCost: 1, dayStartApiMs: 10 * MINUTE }));
    });
});

describe('computeDailyTotals', () => {
    it('adds up today\'s cost and active time across sessions', () => {
        const totals = computeDailyTotals({
            a: session({ cost: 2.5, apiMs: 30 * MINUTE }),
            b: session({ cost: 3, apiMs: 25 * MINUTE, dayStartCost: 1, dayStartApiMs: 10 * MINUTE, startedAt: Date.parse('2026-10-04T22:00:00Z') })
        }, NOW);

        expect(totals.claudeCodeCost).toBe(4.5);
        expect(totals.activeMs).toBe(45 * MINUTE);
    });

    it('counts clock time once for overlapping sessions and not at all between sessions', () => {
        // 09:00-11:00 covered by two overlapping sessions, then 13:00-14:00: 3 hours.
        const totals = computeDailyTotals({
            a: session({ firstSeenAt: at('09:00'), lastSeenAt: at('10:00') }),
            b: session({ firstSeenAt: at('09:30'), lastSeenAt: at('11:00') }),
            c: session({ firstSeenAt: at('13:00'), lastSeenAt: at('14:00') })
        }, NOW);

        expect(totals.clockMs).toBe(3 * HOUR);
    });

    it('starts an overnight session\'s clock time at midnight UTC', () => {
        const totals = computeDailyTotals({ a: session({ firstSeenAt: Date.parse('2026-10-04T22:00:00Z'), lastSeenAt: at('02:00') }) }, NOW);

        expect(totals.clockMs).toBe(2 * HOUR);
    });

    it('leaves out sessions last seen yesterday', () => {
        expect(computeDailyTotals({ old: session({ lastSeenDay: '2026-10-04', lastSeenAt: Date.parse('2026-10-04T20:00:00Z') }) }, NOW)).toEqual({ claudeCodeCost: 0, activeMs: 0, clockMs: 0 });
    });
});

describe('observeSessionCost', () => {
    afterEach(() => {
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('keeps each Claude Code profile\'s sessions separate', () => {
        const deps = makeDeps(null, at('14:00'));
        observeSessionCost('default', 's1', { cost: 0, apiMs: 0, durationMs: 0 }, deps);
        observeSessionCost('/Users/me/.claude-work', 's2', { cost: 0, apiMs: 0, durationMs: 0 }, deps);
        deps.now = () => NOW;

        observeSessionCost('default', 's1', { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, deps);
        const work = observeSessionCost('/Users/me/.claude-work', 's2', { cost: 1, apiMs: 6 * MINUTE, durationMs: HOUR }, deps);

        expect(work).toEqual({ claudeCodeCost: 1, activeMs: 6 * MINUTE, clockMs: HOUR });
        expect(Object.keys(readDailyState(deps).sessions).sort()).toEqual(['/Users/me/.claude-work', 'default']);
    });

    it('adds the other sessions of the profile seen today', () => {
        const s1 = session({ startedAt: at('09:00'), firstSeenAt: at('09:00'), lastSeenAt: at('10:00') });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1, s2: newSession() } } });

        const totals = observeSessionCost('default', 's2', { cost: 1, apiMs: 6 * MINUTE, durationMs: HOUR }, deps);

        expect(totals).toEqual({ claudeCodeCost: 3.5, activeMs: 36 * MINUTE, clockMs: 2 * HOUR });
    });

    it('skips the write when nothing changed in the last minute', () => {
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1: session({ lastSeenAt: NOW - 30_000 }) } } });

        observeSessionCost('default', 's1', { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, deps);

        expect(deps.writes).toBe(0);
    });

    it('still counts this session when another writer holds the lock', () => {
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1: newSession() } } });
        fs.writeFileSync(LOCK_PATH, '');

        expect(observeSessionCost('default', 's1', { cost: 2.5, apiMs: 30 * MINUTE, durationMs: HOUR }, deps))
            .toEqual({ claudeCodeCost: 2.5, activeMs: 30 * MINUTE, clockMs: HOUR });
        expect(deps.writes).toBe(0);
    });

    it('leaves out the totals Claude Code restores when a session is resumed the next day', () => {
        // Ran 18:00-20:00 yesterday: $8, with Claude working for 40 minutes.
        const s1 = session({
            lastSeenDay: '2026-10-04',
            lastSeenAt: Date.parse('2026-10-04T20:00:00Z'),
            startedAt: Date.parse('2026-10-04T18:00:00Z'),
            firstSeenAt: Date.parse('2026-10-04T18:00:00Z'),
            cost: 8,
            apiMs: 40 * MINUTE
        });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1 } } }, at('10:00'));

        // Resumed at 10:00: the duration carries on from the 2 hours it ran.
        expect(observeSessionCost('default', 's1', { cost: 8, apiMs: 40 * MINUTE, durationMs: 2 * HOUR }, deps))
            .toEqual({ claudeCodeCost: 0, activeMs: 0, clockMs: 0 });
        deps.now = () => at('10:30');
        expect(observeSessionCost('default', 's1', { cost: 9, apiMs: 45 * MINUTE, durationMs: 2.5 * HOUR }, deps))
            .toEqual({ claudeCodeCost: 1, activeMs: 5 * MINUTE, clockMs: 30 * MINUTE });
    });

    it('leaves out the totals a forked session starts with', () => {
        // s1 ran 08:00-09:00 today: $5, with Claude working for 20 minutes.
        const s1 = session({ startedAt: at('08:00'), firstSeenAt: at('08:00'), lastSeenAt: at('09:00'), cost: 5, apiMs: 20 * MINUTE });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1 } } }, at('11:00'));

        // Forked at 11:00: a new session id, with s1's totals and duration.
        expect(observeSessionCost('default', 'fork', { cost: 5, apiMs: 20 * MINUTE, durationMs: HOUR }, deps))
            .toEqual({ claudeCodeCost: 5, activeMs: 20 * MINUTE, clockMs: HOUR });
        deps.now = () => at('12:00');
        expect(observeSessionCost('default', 'fork', { cost: 10, apiMs: 40 * MINUTE, durationMs: 2 * HOUR }, deps))
            .toEqual({ claudeCodeCost: 10, activeMs: 40 * MINUTE, clockMs: 2 * HOUR });
    });

    it('keeps what a session counted today when a /login restarts its totals', () => {
        // Started at 10:00; by 12:00, $6 with Claude working for 30 minutes.
        const s1 = session({ startedAt: at('10:00'), firstSeenAt: at('10:00'), lastSeenAt: at('12:00'), cost: 6, apiMs: 30 * MINUTE });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1 } } }, at('12:00'));

        // /login sets the totals and the duration back to zero, under the same session id.
        expect(observeSessionCost('default', 's1', { cost: 0, apiMs: 0, durationMs: 0 }, deps))
            .toEqual({ claudeCodeCost: 6, activeMs: 30 * MINUTE, clockMs: 2 * HOUR });
        deps.now = () => at('13:00');
        expect(observeSessionCost('default', 's1', { cost: 2, apiMs: 10 * MINUTE, durationMs: HOUR }, deps))
            .toEqual({ claudeCodeCost: 8, activeMs: 40 * MINUTE, clockMs: 3 * HOUR });
    });

    it('leaves the time in between out of the clock time of a session resumed the same day', () => {
        // s1 ran 08:00-09:00 and s2 10:00-11:00.
        const s1 = session({ startedAt: at('08:00'), firstSeenAt: at('08:00'), lastSeenAt: at('09:00'), cost: 5, apiMs: 20 * MINUTE });
        const s2 = session({ startedAt: at('10:00'), firstSeenAt: at('10:00'), lastSeenAt: at('11:00'), cost: 1, apiMs: 5 * MINUTE });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1, s2 } } }, at('11:00'));

        // s1 resumed at 11:00: its totals restored, its duration carrying on from an hour.
        observeSessionCost('default', 's1', { cost: 5, apiMs: 20 * MINUTE, durationMs: HOUR }, deps);
        deps.now = () => at('12:00');

        expect(observeSessionCost('default', 's1', { cost: 7, apiMs: 30 * MINUTE, durationMs: 2 * HOUR }, deps))
            .toEqual({ claudeCodeCost: 8, activeMs: 35 * MINUTE, clockMs: 3 * HOUR });
    });

    it('drops a session last seen while the clock ran ahead, rather than count it towards a later day', () => {
        // While the clock ran a day ahead, from 08:00 to 10:00 today, s1 was
        // first and last seen, at 08:00 and 10:00 tomorrow, and s3, running
        // since 08:00 today, was last seen at 09:00 tomorrow, which made that
        // its day. Now it's really 07:00 tomorrow, and s2 has run since 06:30,
        // with nothing new since it was seen half a minute ago.
        const s1 = session({
            lastSeenDay: '2026-10-06',
            lastSeenAt: Date.parse('2026-10-06T10:00:00Z'),
            startedAt: Date.parse('2026-10-06T08:00:00Z'),
            firstSeenAt: Date.parse('2026-10-06T08:00:00Z'),
            dayFirstSeenAt: Date.parse('2026-10-06T08:00:00Z'),
            cost: 4,
            dayStartCost: 1
        });
        const s3 = session({
            lastSeenDay: '2026-10-06',
            lastSeenAt: Date.parse('2026-10-06T09:00:00Z'),
            startedAt: at('08:00'),
            firstSeenAt: at('08:00'),
            dayFirstSeenAt: Date.parse('2026-10-06T09:00:00Z'),
            cost: 2,
            dayStartCost: 1.5
        });
        const s2 = session({
            lastSeenDay: '2026-10-06',
            lastSeenAt: Date.parse('2026-10-06T06:59:30Z'),
            startedAt: Date.parse('2026-10-06T06:30:00Z'),
            firstSeenAt: Date.parse('2026-10-06T06:30:00Z'),
            dayFirstSeenAt: Date.parse('2026-10-06T06:30:00Z'),
            cost: 0.5,
            apiMs: 5 * MINUTE
        });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1, s2, s3 } } }, Date.parse('2026-10-06T07:00:00Z'));

        expect(observeSessionCost('default', 's2', { cost: 0.5, apiMs: 5 * MINUTE, durationMs: 30 * MINUTE }, deps))
            .toEqual({ claudeCodeCost: 0.5, activeMs: 5 * MINUTE, clockMs: 30 * MINUTE });
        expect(Object.keys(readDailyState(deps).sessions.default ?? {})).toEqual(['s2']);
    });

    it('keeps what sessions counted today when the clock ran ahead and was put right the same day', () => {
        // s0 has run since 22:00 yesterday and was first seen today at 00:30;
        // s1 has run since 08:00 and s2 since 09:00. At 10:00 the clock ran two
        // hours ahead, so they were last seen at "11:00", "12:00" and "11:30".
        const s0 = session({
            startedAt: Date.parse('2026-10-04T22:00:00Z'),
            firstSeenAt: Date.parse('2026-10-04T22:00:00Z'),
            dayFirstSeenAt: at('00:30'),
            lastSeenAt: at('11:00'),
            cost: 4,
            apiMs: 40 * MINUTE,
            dayStartCost: 3,
            dayStartApiMs: 30 * MINUTE
        });
        const s1 = session({ startedAt: at('08:00'), firstSeenAt: at('08:00'), dayFirstSeenAt: at('08:00'), lastSeenAt: at('12:00'), cost: 5, apiMs: 50 * MINUTE });
        const s2 = session({ startedAt: at('09:00'), firstSeenAt: at('09:00'), dayFirstSeenAt: at('09:00'), lastSeenAt: at('11:30'), cost: 1, apiMs: 10 * MINUTE });
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s0, s1, s2 } } }, at('10:05'));

        expect(observeSessionCost('default', 's1', { cost: 6, apiMs: 60 * MINUTE, durationMs: 2 * HOUR + 5 * MINUTE }, deps))
            .toEqual({ claudeCodeCost: 8, activeMs: 80 * MINUTE, clockMs: 10 * HOUR + 5 * MINUTE });
        expect(readDailyState(deps).sessions.default?.s2?.lastSeenAt).toBe(at('10:05'));
    });
});

describe('prefetchDailyCostIfNeeded', () => {
    const rateLine = [[{ id: '1', type: 'daily-cost-rate' }]];
    const payload = {
        session_id: 's1',
        cost: { total_cost_usd: 2.5, total_api_duration_ms: 30 * MINUTE, total_duration_ms: HOUR }
    };
    let savedConfigDir: string | undefined;

    beforeEach(() => {
        savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
        delete process.env.CLAUDE_CONFIG_DIR;
    });

    afterEach(() => {
        if (savedConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
        }
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('records nothing when no line shows Daily Cost Rate', () => {
        const deps = makeDeps(null);

        expect(prefetchDailyCostIfNeeded([[{ id: '1', type: 'session-cost' }]], payload, deps)).toBeNull();
        expect(deps.writes).toBe(0);
    });

    it('records nothing without a session id and its cost and durations', () => {
        const deps = makeDeps(null);

        expect(prefetchDailyCostIfNeeded(rateLine, { cost: payload.cost }, deps)).toBeNull();
        expect(prefetchDailyCostIfNeeded(rateLine, { session_id: 's1', cost: { total_cost_usd: 2.5 } }, deps)).toBeNull();
        expect(deps.writes).toBe(0);
    });

    it('records the session under its Claude Code profile and returns today\'s totals', () => {
        const deps = makeDeps({ version: 1, spend: {}, sessions: { default: { s1: newSession() } } });

        expect(prefetchDailyCostIfNeeded(rateLine, payload, deps)).toEqual({ claudeCodeCost: 2.5, activeMs: 30 * MINUTE, clockMs: HOUR });
        process.env.CLAUDE_CONFIG_DIR = '/Users/me/.claude-work';
        prefetchDailyCostIfNeeded(rateLine, { ...payload, session_id: 's2' }, deps);

        expect(Object.keys(readDailyState(deps).sessions).sort()).toEqual(['/Users/me/.claude-work', 'default']);
    });
});
