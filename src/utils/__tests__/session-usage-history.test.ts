import {
    describe,
    expect,
    it
} from 'vitest';

import type { SessionUsageReading } from '../session-forecast';
import {
    recordSessionUsageReading,
    type SessionUsageHistoryDeps
} from '../session-usage-history';

const CACHE_PATH = '/cache/ccstatusline/session-usage-history.json';
const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 9, 8, 13, 17);
const RESET_AT = Date.UTC(2026, 9, 8, 15, 0);

interface StoredWindow {
    resetAt: number;
    readings: SessionUsageReading[];
}

function history(profiles: Record<string, StoredWindow[]>): unknown {
    return { version: 1, profiles };
}

function makeDeps(initial?: unknown): SessionUsageHistoryDeps & { files: Map<string, string>; writes: number } {
    const files = new Map<string, string>();
    if (initial !== undefined) {
        files.set(CACHE_PATH, typeof initial === 'string' ? initial : JSON.stringify(initial));
    }

    const deps = {
        files,
        writes: 0,
        cachePath: CACHE_PATH,
        now: () => NOW,
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

function stored(deps: ReturnType<typeof makeDeps>): unknown {
    return JSON.parse(deps.files.get(CACHE_PATH) ?? 'null') as unknown;
}

describe('recordSessionUsageReading', () => {
    it('starts a window on the first reading and saves it in place', () => {
        const deps = makeDeps();

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect(stored(deps)).toEqual(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW, NOW, 42]] }] }));
        expect([...deps.files.keys()]).toEqual([CACHE_PATH]);
    });

    it('appends a reading when the percent changes', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 40]] }] }));

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([
            [NOW - 5 * MINUTE, NOW - 2 * MINUTE, 40],
            [NOW, NOW, 42]
        ]);
    });

    it('moves the last-seen time when the percent has been unchanged for a minute', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - MINUTE, 42]] }] }));

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW - 5 * MINUTE, NOW, 42]]);
        expect(deps.writes).toBe(1);
    });

    // Usage never falls within a window, so a lower percent is another session's
    // stale payload, and recording it would fake a steep climb half an hour later.
    it('ignores a lower percent from a stale session', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 42]] }] }));

        expect(recordSessionUsageReading('/p', RESET_AT, 30, deps)).toEqual([[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 42]]);
        expect(deps.writes).toBe(0);
    });

    it('skips the write when the percent is unchanged within a minute', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 30_000, 42]] }] }));

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW - 5 * MINUTE, NOW - 30_000, 42]]);
        expect(deps.writes).toBe(0);
    });

    it('joins the window whose reset differs only by the API\'s fractional seconds', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 40]] }] }));

        expect(recordSessionUsageReading('/p', RESET_AT + 123.951, 42, deps)).toHaveLength(2);
        expect(stored(deps)).toEqual(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 40], [NOW, NOW, 42]] }] }));
    });

    it('starts a new window when the reset moved by more than an hour', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 40]] }] }));
        const nextResetAt = RESET_AT + 5 * 60 * MINUTE;

        expect(recordSessionUsageReading('/p', nextResetAt, 3, deps)).toEqual([[NOW, NOW, 3]]);
        expect(stored(deps)).toEqual(history({
            '/p': [
                { resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 40]] },
                { resetAt: nextResetAt, readings: [[NOW, NOW, 3]] }
            ]
        }));
    });

    it('drops windows that have reset, and profiles left with none', () => {
        const deps = makeDeps(history({
            '/p': [{ resetAt: NOW - MINUTE, readings: [[NOW - 60 * MINUTE, NOW - 2 * MINUTE, 90]] }],
            '/old': [{ resetAt: NOW - MINUTE, readings: [[NOW - 60 * MINUTE, NOW - 2 * MINUTE, 50]] }]
        }));

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect(stored(deps)).toEqual(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW, NOW, 42]] }] }));
    });

    it('keeps only the readings the forecast can use', () => {
        const deps = makeDeps(history({
            '/p': [{
                resetAt: RESET_AT,
                readings: [
                    [NOW - 50 * MINUTE, NOW - 45 * MINUTE, 10],
                    [NOW - 40 * MINUTE, NOW - 35 * MINUTE, 20],
                    [NOW - 20 * MINUTE, NOW - 10 * MINUTE, 30]
                ]
            }]
        }));

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([
            [NOW - 40 * MINUTE, NOW - 35 * MINUTE, 20],
            [NOW - 20 * MINUTE, NOW - 10 * MINUTE, 30],
            [NOW, NOW, 42]
        ]);
    });

    it('stays bounded when the percent changes on every render for an hour', () => {
        let deps = makeDeps();
        for (let minute = 60; minute >= 1; minute--) {
            const previous = deps.files.get(CACHE_PATH);
            deps = makeDeps(previous);
            deps.now = () => NOW - minute * MINUTE;
            recordSessionUsageReading('/p', RESET_AT, 100 - minute, deps);
        }

        const readings = recordSessionUsageReading('/p', RESET_AT, 100, makeDeps(deps.files.get(CACHE_PATH)));

        // Readings first seen at or before 12:47 are dropped except the last of them
        // (12:47 itself), so 12:47 through 13:16 plus now remain.
        expect(readings).toHaveLength(31);
        expect(readings[0]?.[0]).toBe(NOW - 30 * MINUTE);
    });

    it('drops readings from a clock that has since moved back', () => {
        const readings: SessionUsageReading[] = [[NOW - 5 * MINUTE, NOW - 4 * MINUTE, 30], [NOW + 5 * MINUTE, NOW + 6 * MINUTE, 50]];
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings }] }));

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([
            [NOW - 5 * MINUTE, NOW - 4 * MINUTE, 30],
            [NOW, NOW, 42]
        ]);
    });

    it('keeps each profile\'s readings apart', () => {
        const work: StoredWindow[] = [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 30]] }];
        const deps = makeDeps(history({ '/work': work }));

        expect(recordSessionUsageReading('/personal', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect(stored(deps)).toEqual(history({
            '/work': work,
            '/personal': [{ resetAt: RESET_AT, readings: [[NOW, NOW, 42]] }]
        }));
    });

    it.each([
        ['a corrupt file', 'not json'],
        ['another schema version', JSON.stringify({ version: 2, profiles: { '/p': [] } })],
        ['malformed windows', JSON.stringify({ version: 1, profiles: { '/p': [{ resetAt: 'soon', readings: [] }, { resetAt: RESET_AT, readings: [[1, 2]] }] } })]
    ])('treats %s as an empty history', (_label, content) => {
        const deps = makeDeps(content);

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect(stored(deps)).toEqual(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW, NOW, 42]] }] }));
    });

    it('clamps percents to 0-100', () => {
        expect(recordSessionUsageReading('/p', RESET_AT, 104, makeDeps())).toEqual([[NOW, NOW, 100]]);
        expect(recordSessionUsageReading('/p', RESET_AT, -3, makeDeps())).toEqual([[NOW, NOW, 0]]);
    });

    it('still returns the readings when the write fails', () => {
        const deps = makeDeps();
        deps.writeFileSync = () => {
            throw new Error('EROFS');
        };

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
    });
});
