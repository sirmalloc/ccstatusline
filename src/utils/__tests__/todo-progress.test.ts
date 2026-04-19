import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getTodoProgressFilePath,
    getTodoProgressMetrics
} from '../todo-progress';

let testHomeDir = '';

describe('todo-progress', () => {
    beforeEach(() => {
        testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-home-'));
        vi.spyOn(os, 'homedir').mockReturnValue(testHomeDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (testHomeDir) {
            fs.rmSync(testHomeDir, { recursive: true, force: true });
        }
    });

    function writeLines(sessionId: string, records: unknown[]): void {
        const filePath = getTodoProgressFilePath(sessionId);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, records.map(r => JSON.stringify(r)).join('\n'), 'utf-8');
    }

    describe('getTodoProgressFilePath', () => {
        it('uses ~/.cache/ccstatusline/todo-progress path', () => {
            expect(getTodoProgressFilePath('session-1')).toBe(
                path.join(testHomeDir, '.cache', 'ccstatusline', 'todo-progress', 'todo-progress-session-1.jsonl')
            );
        });
    });

    describe('getTodoProgressMetrics', () => {
        it('returns empty metrics when file does not exist', () => {
            expect(getTodoProgressMetrics('missing')).toEqual({ todos: [], timestamp: null });
        });

        it('returns the single snapshot when one line exists', () => {
            writeLines('s-one', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-one',
                    todos: [
                        { content: 'Fix auth', status: 'in_progress' },
                        { content: 'Ship', status: 'pending' }
                    ]
                }
            ]);

            const metrics = getTodoProgressMetrics('s-one');
            expect(metrics.timestamp).toBe('2026-04-19T10:00:00.000Z');
            expect(metrics.todos).toEqual([
                { content: 'Fix auth', status: 'in_progress' },
                { content: 'Ship', status: 'pending' }
            ]);
        });

        it('returns the latest snapshot when multiple lines exist', () => {
            writeLines('s-many', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-many',
                    todos: [{ content: 'A', status: 'pending' }]
                },
                {
                    timestamp: '2026-04-19T10:05:00.000Z',
                    session_id: 's-many',
                    todos: [
                        { content: 'A', status: 'completed' },
                        { content: 'B', status: 'in_progress' }
                    ]
                }
            ]);

            const metrics = getTodoProgressMetrics('s-many');
            expect(metrics.timestamp).toBe('2026-04-19T10:05:00.000Z');
            expect(metrics.todos).toHaveLength(2);
            expect(metrics.todos[1]).toEqual({ content: 'B', status: 'in_progress' });
        });

        it('preserves activeForm when present', () => {
            writeLines('s-active', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-active',
                    todos: [
                        { content: 'Fix auth', activeForm: 'Fixing auth', status: 'in_progress' }
                    ]
                }
            ]);

            expect(getTodoProgressMetrics('s-active').todos[0]).toEqual({
                content: 'Fix auth',
                activeForm: 'Fixing auth',
                status: 'in_progress'
            });
        });

        it('skips malformed JSON and returns the latest valid line', () => {
            const filePath = getTodoProgressFilePath('s-bad');
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const valid = JSON.stringify({
                timestamp: '2026-04-19T10:00:00.000Z',
                session_id: 's-bad',
                todos: [{ content: 'A', status: 'pending' }]
            });
            fs.writeFileSync(filePath, `${valid}\nnot-json\n`, 'utf-8');

            const metrics = getTodoProgressMetrics('s-bad');
            expect(metrics.todos).toHaveLength(1);
            expect(metrics.todos[0]?.content).toBe('A');
        });

        it('falls back to an earlier valid snapshot when the last line is malformed', () => {
            const filePath = getTodoProgressFilePath('s-fallback');
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const valid = JSON.stringify({
                timestamp: '2026-04-19T09:00:00.000Z',
                session_id: 's-fallback',
                todos: [{ content: 'A', status: 'pending' }]
            });
            fs.writeFileSync(filePath, `${valid}\n{broken\n`, 'utf-8');

            expect(getTodoProgressMetrics('s-fallback').todos[0]?.content).toBe('A');
        });

        it('filters out snapshots with a different session_id', () => {
            writeLines('s-want', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-other',
                    todos: [{ content: 'Leaked', status: 'in_progress' }]
                },
                {
                    timestamp: '2026-04-19T10:01:00.000Z',
                    session_id: 's-want',
                    todos: [{ content: 'Mine', status: 'pending' }]
                }
            ]);

            expect(getTodoProgressMetrics('s-want').todos[0]?.content).toBe('Mine');
        });

        it('drops individual todos that are missing content or status', () => {
            writeLines('s-drop', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-drop',
                    todos: [
                        { content: 'Good', status: 'pending' },
                        { status: 'pending' },
                        { content: 'No status' },
                        { content: 'Weird status', status: 'blocked' },
                        { content: 'Also good', status: 'completed' }
                    ]
                }
            ]);

            const metrics = getTodoProgressMetrics('s-drop');
            expect(metrics.todos.map(t => t.content)).toEqual(['Good', 'Also good']);
        });

        it('returns empty metrics when todos is not an array', () => {
            writeLines('s-nonarr', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-nonarr',
                    todos: 'oops'
                }
            ]);

            expect(getTodoProgressMetrics('s-nonarr')).toEqual({ todos: [], timestamp: null });
        });
    });

    describe('getTodoProgressMetrics — turn boundary purge', () => {
        it('returns empty todos when latest snapshot predates the last turn marker', () => {
            writeLines('s-stale', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-stale',
                    todos: [{ content: 'Old task', status: 'in_progress' }]
                },
                { timestamp: '2026-04-19T10:05:00.000Z', session_id: 's-stale', event: 'turn' }
            ]);

            const metrics = getTodoProgressMetrics('s-stale');
            expect(metrics.todos).toEqual([]);
            // timestamp is still preserved so callers can tell "had data once"
            expect(metrics.timestamp).toBe('2026-04-19T10:00:00.000Z');
        });

        it('keeps snapshot when it is newer than the last turn marker', () => {
            writeLines('s-fresh', [
                { timestamp: '2026-04-19T10:00:00.000Z', session_id: 's-fresh', event: 'turn' },
                {
                    timestamp: '2026-04-19T10:01:00.000Z',
                    session_id: 's-fresh',
                    todos: [{ content: 'Current task', status: 'in_progress' }]
                }
            ]);

            const metrics = getTodoProgressMetrics('s-fresh');
            expect(metrics.todos.map(t => t.content)).toEqual(['Current task']);
        });

        it('no purge when no turn marker present (legacy files)', () => {
            writeLines('s-no-turn', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-no-turn',
                    todos: [{ content: 'Still here', status: 'pending' }]
                }
            ]);

            expect(getTodoProgressMetrics('s-no-turn').todos).toHaveLength(1);
        });

        it('ignores turn markers from other sessions', () => {
            writeLines('s-own', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-own',
                    todos: [{ content: 'Mine', status: 'pending' }]
                },
                { timestamp: '2026-04-19T10:05:00.000Z', session_id: 'other-session', event: 'turn' }
            ]);

            expect(getTodoProgressMetrics('s-own').todos).toHaveLength(1);
        });
    });
});