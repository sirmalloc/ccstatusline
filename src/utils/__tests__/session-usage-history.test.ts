import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { StatusJSON } from '../../types/StatusJSON';
import type { SessionUsageReading } from '../session-forecast';
import {
    getDefaultSessionUsageHistoryDeps,
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

function makeDeps(initial?: unknown): SessionUsageHistoryDeps & { files: Map<string, string>; mtimes: Map<string, number>; writes: number } {
    const files = new Map<string, string>();
    const mtimes = new Map<string, number>();
    if (initial !== undefined) {
        files.set(CACHE_PATH, typeof initial === 'string' ? initial : JSON.stringify(initial));
    }

    const deps = {
        files,
        mtimes,
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
            mtimes.set(p, deps.now());
        },
        renameSync: (from: string, to: string) => {
            const data = files.get(from);
            if (data === undefined) {
                throw new Error('ENOENT');
            }

            files.set(to, data);
            mtimes.set(to, mtimes.get(from) ?? deps.now());
            files.delete(from);
            mtimes.delete(from);
        },
        unlinkSync: (p: string) => {
            if (!files.delete(p)) {
                throw new Error('ENOENT');
            }
            mtimes.delete(p);
        },
        readdirSync: (dir: string) => [...files.keys()]
            .filter(p => path.dirname(p) === dir)
            .map(p => path.basename(p)),
        statSync: (p: string) => {
            if (!files.has(p)) {
                throw new Error('ENOENT');
            }

            return { mtimeMs: mtimes.get(p) ?? deps.now() };
        }
    };
    return deps;
}

// A temp file another render wrote ageMs ago, as one whose rename failed leaves
function leaveTempFile(deps: ReturnType<typeof makeDeps>, name: string, ageMs: number): string {
    const tempPath = path.join(path.dirname(CACHE_PATH), name);
    deps.files.set(tempPath, '{}');
    deps.mtimes.set(tempPath, NOW - ageMs);
    return tempPath;
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

    // Claude Code re-renders an idle session on its refresh interval with the
    // percent from its last response, which says nothing about the time since.
    it('moves the last-seen time no later than when the percent was seen', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 50 * MINUTE, NOW - 45 * MINUTE, 20]] }] }));
        deps.percentSeenAt = () => NOW - 40 * MINUTE;

        expect(recordSessionUsageReading('/p', RESET_AT, 20, deps)).toEqual([[NOW - 50 * MINUTE, NOW - 40 * MINUTE, 20]]);
    });

    it('skips the write when an idle session\'s percent has been seen up to its last response', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 50 * MINUTE, NOW - 40 * MINUTE, 20]] }] }));
        deps.percentSeenAt = () => NOW - 40 * MINUTE;

        expect(recordSessionUsageReading('/p', RESET_AT, 20, deps)).toEqual([[NOW - 50 * MINUTE, NOW - 40 * MINUTE, 20]]);
        expect(deps.writes).toBe(0);
    });

    // After /clear the session starts a new transcript, with no response in it
    // yet, while the payload keeps the percent from the last one
    it('keeps the last sighting when nothing shows the percent was seen since', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 50 * MINUTE, NOW - 45 * MINUTE, 20]] }] }));
        deps.percentSeenAt = () => undefined;

        expect(recordSessionUsageReading('/p', RESET_AT, 20, deps)).toEqual([[NOW - 50 * MINUTE, NOW - 45 * MINUTE, 20]]);
        expect(deps.writes).toBe(0);
    });

    it('doesn\'t ask when the percent was seen while its last sighting is under a minute old', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 30_000, 42]] }] }));
        let asked = 0;
        deps.percentSeenAt = () => {
            asked += 1;
            return NOW;
        };

        recordSessionUsageReading('/p', RESET_AT, 42, deps);

        expect(asked).toBe(0);
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

    it('starts a new window when the reset moves on to the next block', () => {
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

    // After /login to another account in the same config directory, its block
    // resets at another time. Its readings are its own, not lower ones to drop
    // from the first account's block.
    it('keeps another login\'s block apart when its reset is minutes away', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 80]] }] }));
        const otherResetAt = RESET_AT + 10 * MINUTE;

        expect(recordSessionUsageReading('/p', otherResetAt, 10, deps)).toEqual([[NOW, NOW, 10]]);
        expect(stored(deps)).toEqual(history({
            '/p': [
                { resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 2 * MINUTE, 80]] },
                { resetAt: otherResetAt, readings: [[NOW, NOW, 10]] }
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

    // Each render is a new process, so a temp file left behind by a failed
    // rename (a Windows virus scanner holding it, say) would pile up per render.
    it('removes its temp file when the rename fails', () => {
        const deps = makeDeps();
        deps.renameSync = () => {
            throw new Error('EPERM');
        };

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect([...deps.files.keys()]).toEqual([]);
    });

    it('still returns the readings when the temp file can\'t be removed either', () => {
        const deps = makeDeps();
        deps.renameSync = () => {
            throw new Error('EPERM');
        };
        deps.unlinkSync = () => {
            throw new Error('EPERM');
        };

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
    });

    // A held handle can refuse a failed rename's unlink too, and builds before
    // that unlink left theirs, so each write clears what earlier renders left.
    it('removes the temp files other renders left a minute or more ago', () => {
        const deps = makeDeps();
        const orphan = leaveTempFile(deps, 'session-usage-history.json.4242.tmp', 2 * MINUTE);
        const midWrite = leaveTempFile(deps, 'session-usage-history.json.4343.tmp', 30_000);
        const others = [
            leaveTempFile(deps, 'daily.json.4444.tmp', 2 * MINUTE),
            leaveTempFile(deps, 'session-usage-history.json.tmp', 2 * MINUTE),
            leaveTempFile(deps, 'session-usage-history.json.bak.tmp', 2 * MINUTE)
        ];

        recordSessionUsageReading('/p', RESET_AT, 42, deps);

        expect(deps.files.has(orphan)).toBe(false);
        expect([...deps.files.keys()].sort()).toEqual([CACHE_PATH, midWrite, ...others].sort());
    });

    it('removes old temp files when its own rename fails too', () => {
        const deps = makeDeps();
        leaveTempFile(deps, 'session-usage-history.json.4242.tmp', 2 * MINUTE);
        deps.renameSync = () => {
            throw new Error('EPERM');
        };

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect([...deps.files.keys()]).toEqual([]);
    });

    it('leaves the temp files alone when it doesn\'t write', () => {
        const deps = makeDeps(history({ '/p': [{ resetAt: RESET_AT, readings: [[NOW - 5 * MINUTE, NOW - 30_000, 42]] }] }));
        const orphan = leaveTempFile(deps, 'session-usage-history.json.4242.tmp', 2 * MINUTE);

        recordSessionUsageReading('/p', RESET_AT, 42, deps);

        expect(deps.files.has(orphan)).toBe(true);
    });

    it('moves on to the next old temp file when one can\'t be removed', () => {
        const deps = makeDeps();
        const held = leaveTempFile(deps, 'session-usage-history.json.4242.tmp', 2 * MINUTE);
        const orphan = leaveTempFile(deps, 'session-usage-history.json.4343.tmp', 2 * MINUTE);
        const unlink = deps.unlinkSync;
        deps.unlinkSync = (p: string) => {
            if (p === held) {
                throw new Error('EPERM');
            }

            unlink(p);
        };

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
        expect(deps.files.has(held)).toBe(true);
        expect(deps.files.has(orphan)).toBe(false);
    });

    it('still returns the readings when the cache directory can\'t be listed', () => {
        const deps = makeDeps();
        deps.readdirSync = () => {
            throw new Error('EACCES');
        };

        expect(recordSessionUsageReading('/p', RESET_AT, 42, deps)).toEqual([[NOW, NOW, 42]]);
    });
});

function transcriptEntry(type: string, timestampMs: number, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ type, timestamp: new Date(timestampMs).toISOString(), ...extra });
}

function payload(transcriptPath: string, fiveHour: StatusJSON['rate_limits'] = { five_hour: { used_percentage: 20, resets_at: RESET_AT / 1000 } }): StatusJSON {
    return { transcript_path: transcriptPath, rate_limits: fiveHour };
}

describe('getDefaultSessionUsageHistoryDeps', () => {
    let dir: string;
    let transcriptPath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-usage-history-'));
        transcriptPath = path.join(dir, 'session.jsonl');
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    // The prompt is written before its response arrives, and the render it
    // triggers still carries the last response's percent.
    it('dates a payload\'s percent by its transcript\'s last response, not a prompt written since', () => {
        fs.writeFileSync(transcriptPath, [
            transcriptEntry('user', NOW - 41 * MINUTE),
            transcriptEntry('assistant', NOW - 40 * MINUTE, { message: { model: 'claude-opus-4-1', role: 'assistant' } }),
            transcriptEntry('user', NOW - MINUTE)
        ].join('\n') + '\n');

        expect(getDefaultSessionUsageHistoryDeps(payload(transcriptPath)).percentSeenAt?.()).toBe(NOW - 40 * MINUTE);
    });

    it('skips the messages Claude Code writes itself, with no response behind them', () => {
        fs.writeFileSync(transcriptPath, [
            transcriptEntry('assistant', NOW - 40 * MINUTE, { message: { model: 'claude-opus-4-1', role: 'assistant' } }),
            transcriptEntry('assistant', NOW - 20 * MINUTE, { isApiErrorMessage: true, message: { model: '<synthetic>', role: 'assistant' } }),
            transcriptEntry('assistant', NOW - 10 * MINUTE, { message: { model: '<synthetic>', role: 'assistant' } })
        ].join('\n') + '\n');

        expect(getDefaultSessionUsageHistoryDeps(payload(transcriptPath)).percentSeenAt?.()).toBe(NOW - 40 * MINUTE);
    });

    // Without a five-hour percent in the payload, it comes from the usage API
    it('takes a percent the payload doesn\'t carry as seen now', () => {
        fs.writeFileSync(transcriptPath, `${transcriptEntry('assistant', NOW - 40 * MINUTE, { message: { model: 'claude-opus-4-1' } })}\n`);

        expect(getDefaultSessionUsageHistoryDeps(payload(transcriptPath, { seven_day: { used_percentage: 20 } })).percentSeenAt).toBeUndefined();
        expect(getDefaultSessionUsageHistoryDeps(payload(transcriptPath, null)).percentSeenAt).toBeUndefined();
        expect(getDefaultSessionUsageHistoryDeps().percentSeenAt).toBeUndefined();
    });

    // The payload's percent is still from a response: one before this
    // transcript began, as after /clear
    it('finds no time for a payload\'s percent without a response in its transcript', () => {
        fs.writeFileSync(transcriptPath, `${transcriptEntry('user', NOW - MINUTE)}\n`);
        const noResponse = getDefaultSessionUsageHistoryDeps(payload(transcriptPath));
        const noTranscript = getDefaultSessionUsageHistoryDeps(payload(path.join(dir, 'missing.jsonl')));

        expect(noResponse.percentSeenAt).toBeDefined();
        expect(noResponse.percentSeenAt?.()).toBeUndefined();
        expect(noTranscript.percentSeenAt).toBeDefined();
        expect(noTranscript.percentSeenAt?.()).toBeUndefined();
    });
});
