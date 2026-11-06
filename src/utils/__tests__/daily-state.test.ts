import * as fs from 'fs';
import * as path from 'path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    DailyState,
    DailyStateDeps,
    SpendDayRecord
} from '../daily-state';
import {
    previousUtcDayKey,
    readDailyState,
    updateDailyState,
    utcDayKey
} from '../daily-state';

// Unique per run: the lock file lives on the real filesystem next to this path
// (see cache-lock.ts), so a shared path could collide with another test process.
const STATE_PATH = `/tmp/test-daily-state-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${STATE_PATH}.lock`;

// Monday 5 October 2026, 15:00 UTC.
const NOW = Date.parse('2026-10-05T15:00:00Z');

function makeDeps(initial: string | null, now = NOW): DailyStateDeps & { files: Map<string, string>; mtimes: Map<string, number> } {
    const files = new Map<string, string>();
    // Modification times of files written before the test; anything the
    // update writes is dated now.
    const mtimes = new Map<string, number>();
    if (initial !== null) {
        files.set(STATE_PATH, initial);
    }

    return {
        files,
        mtimes,
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
            files.set(p, data);
            mtimes.set(p, now);
        },
        renameSync: (from: string, to: string) => {
            const data = files.get(from);
            if (data === undefined) {
                throw new Error('ENOENT');
            }
            files.set(to, data);
            files.delete(from);
        },
        unlinkSync: (p: string) => {
            if (!files.delete(p)) {
                throw new Error('ENOENT');
            }
        },
        readdirSync: (dir: string) => [...files.keys()]
            .filter(p => path.dirname(p) === dir)
            .map(p => path.basename(p)),
        statSync: (p: string) => {
            const mtimeMs = mtimes.get(p);
            if (!files.has(p) || mtimeMs === undefined) {
                throw new Error('ENOENT');
            }
            return { mtimeMs };
        }
    };
}

function record(lastSeenDay: string, used = 1000): SpendDayRecord {
    return { day: lastSeenDay, baselineUsed: used, lastSeenDay, lastSeenUsed: used, lastSeenAt: Date.parse(`${lastSeenDay}T12:00:00Z`) };
}

describe('UTC day keys', () => {
    it('names the UTC calendar day', () => {
        expect(utcDayKey(Date.parse('2026-10-05T23:59:59Z'))).toBe('2026-10-05');
        expect(utcDayKey(Date.parse('2026-10-06T00:00:00Z'))).toBe('2026-10-06');
        // 7:30pm on 5 October in US Central time is already the 6th in UTC.
        expect(utcDayKey(Date.parse('2026-10-05T19:30:00-05:00'))).toBe('2026-10-06');
    });

    it('names the previous UTC day across a month boundary', () => {
        expect(previousUtcDayKey(Date.parse('2026-11-01T00:00:00Z'))).toBe('2026-10-31');
        expect(previousUtcDayKey(NOW)).toBe('2026-10-04');
    });
});

describe('daily state file', () => {
    afterEach(() => {
        fs.rmSync(LOCK_PATH, { force: true });
    });

    it('reads a missing file as empty state', () => {
        expect(readDailyState(makeDeps(null))).toEqual({ version: 1, spend: {} });
    });

    it('reads a corrupt file, another version, or invalid records as empty', () => {
        expect(readDailyState(makeDeps('{not json'))).toEqual({ version: 1, spend: {} });
        expect(readDailyState(makeDeps(JSON.stringify({ version: 2, spend: { a: record('2026-10-05') } })))).toEqual({ version: 1, spend: {} });
        expect(readDailyState(makeDeps(JSON.stringify({
            version: 1,
            spend: {
                good: record('2026-10-05'),
                bad: { day: '2026-10-05', baselineUsed: 'lots' }
            }
        })))).toEqual({ version: 1, spend: { good: record('2026-10-05') } });
    });

    it('writes through a temp file and rename, and reads the result back', () => {
        const deps = makeDeps(null);

        const ran = updateDailyState(state => ({ ...state, spend: { acct: record('2026-10-05', 12345) } }), deps);

        expect(ran).toBe(true);
        expect([...deps.files.keys()]).toEqual([STATE_PATH]);
        expect(readDailyState(deps)).toEqual({ version: 1, spend: { acct: record('2026-10-05', 12345) } });
    });

    it('removes the temp file when the rename fails, keeping the old state', () => {
        const deps = makeDeps(JSON.stringify({ version: 1, spend: { acct: record('2026-10-05', 100) } }));
        // A handle held on daily.json (a Windows virus scanner or sync
        // client) makes the rename onto it fail with EPERM.
        deps.renameSync = () => { throw new Error('EPERM'); };

        const ran = updateDailyState(state => ({ ...state, spend: { acct: record('2026-10-05', 12345) } }), deps);

        expect(ran).toBe(true);
        expect([...deps.files.keys()]).toEqual([STATE_PATH]);
        expect(readDailyState(deps).spend).toEqual({ acct: record('2026-10-05', 100) });
    });

    it('removes a partly written temp file when the write fails', () => {
        const deps = makeDeps(null);
        deps.writeFileSync = (p: string) => {
            deps.files.set(p, '{"version":1,"sp');
            throw new Error('ENOSPC');
        };

        updateDailyState(state => ({ ...state, spend: { acct: record('2026-10-05', 12345) } }), deps);

        expect(deps.files.size).toBe(0);
    });

    // A handle held on a temp file refuses its removal as well as its rename,
    // so that render's temp file stays; so do files from builds that never
    // removed theirs. Each write clears those old enough that no running
    // write can still own them.
    it('clears the temp files earlier writes left behind once they are a minute old', () => {
        const deps = makeDeps(null);
        const orphans = {
            stale: `${STATE_PATH}.4242.tmp`,
            aMinuteOld: `${STATE_PATH}.4141.tmp`,
            fresh: `${STATE_PATH}.4343.tmp`,
            otherFile: '/tmp/session-usage-history.json.4444.tmp',
            notATempName: `${STATE_PATH}.bak.tmp`
        };
        for (const orphan of Object.values(orphans)) {
            deps.files.set(orphan, '{"version":1,"spend":{}}');
        }
        deps.mtimes.set(orphans.stale, NOW - 2 * 60 * 1000);
        deps.mtimes.set(orphans.aMinuteOld, NOW - 60 * 1000);
        deps.mtimes.set(orphans.fresh, NOW - 10 * 1000);
        deps.mtimes.set(orphans.otherFile, NOW - 2 * 60 * 1000);
        deps.mtimes.set(orphans.notATempName, NOW - 2 * 60 * 1000);

        updateDailyState(state => ({ ...state, spend: { acct: record('2026-10-05', 12345) } }), deps);

        expect([...deps.files.keys()].sort()).toEqual([
            orphans.otherFile,
            STATE_PATH,
            orphans.notATempName,
            orphans.fresh
        ].sort());
    });

    it('writes nothing when the update reports no change', () => {
        const deps = makeDeps(null);

        expect(updateDailyState(() => null, deps)).toBe(true);
        expect(deps.files.size).toBe(0);
    });

    it('drops records last seen before yesterday when writing', () => {
        const deps = makeDeps(null);
        const state: DailyState = {
            version: 1,
            spend: {
                today: record('2026-10-05'),
                yesterday: record('2026-10-04'),
                stale: record('2026-10-03')
            }
        };

        updateDailyState(() => state, deps);

        expect(Object.keys(readDailyState(deps).spend).sort()).toEqual(['today', 'yesterday']);
    });

    it('skips the update while another writer holds a fresh lock', () => {
        const deps = makeDeps(null);
        fs.writeFileSync(LOCK_PATH, '');
        let called = false;

        const ran = updateDailyState((state) => {
            called = true;
            return state;
        }, deps);

        expect(ran).toBe(false);
        expect(called).toBe(false);
        expect(deps.files.size).toBe(0);
    });
});
