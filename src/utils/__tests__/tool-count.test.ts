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
    basename,
    extractTarget,
    getToolCountFilePath,
    getToolCountMetrics
} from '../tool-count';

let testHomeDir = '';

function writeLines(sessionId: string, records: unknown[]): void {
    const filePath = getToolCountFilePath(sessionId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, records.map(r => JSON.stringify(r)).join('\n'), 'utf-8');
}

describe('tool-count', () => {
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

    describe('getToolCountMetrics — legacy schema (no event field)', () => {
        it('returns empty metrics when no file exists', () => {
            expect(getToolCountMetrics('missing')).toEqual({
                totalInvocations: 0,
                byCategory: { builtin: 0, mcp: 0 },
                byTool: {},
                lastTool: null,
                activity: []
            });
        });

        it('counts invocations and tracks lastTool for legacy rows', () => {
            writeLines('s-legacy', [
                { timestamp: 't1', session_id: 's-legacy', tool_name: 'Read', category: 'builtin' },
                { timestamp: 't2', session_id: 's-legacy', tool_name: 'Edit', category: 'builtin' },
                { timestamp: 't3', session_id: 's-legacy', tool_name: 'mcp__foo__bar', category: 'mcp' }
            ]);

            const metrics = getToolCountMetrics('s-legacy');
            expect(metrics.totalInvocations).toBe(3);
            expect(metrics.byCategory).toEqual({ builtin: 2, mcp: 1 });
            expect(metrics.byTool).toEqual({ Read: 1, Edit: 1, mcp__foo__bar: 1 });
            expect(metrics.lastTool).toBe('mcp__foo__bar');
            expect(metrics.activity).toEqual([]);
        });

        it('filters rows from a different session_id', () => {
            writeLines('s-a', [
                { timestamp: 't1', session_id: 's-b', tool_name: 'Read', category: 'builtin' },
                { timestamp: 't2', session_id: 's-a', tool_name: 'Edit', category: 'builtin' }
            ]);

            const metrics = getToolCountMetrics('s-a');
            expect(metrics.totalInvocations).toBe(1);
            expect(metrics.lastTool).toBe('Edit');
        });
    });

    describe('getToolCountMetrics — activity pairing', () => {
        it('keeps status running when only a start event exists', () => {
            writeLines('s-run', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-run',
                    tool_name: 'Edit',
                    category: 'builtin',
                    event: 'start',
                    tool_use_id: 'u1',
                    target: '/repo/src/auth.ts'
                }
            ]);

            const metrics = getToolCountMetrics('s-run');
            expect(metrics.totalInvocations).toBe(1);
            expect(metrics.activity).toHaveLength(1);
            expect(metrics.activity[0]).toMatchObject({
                id: 'u1',
                tool_name: 'Edit',
                status: 'running',
                target: '/repo/src/auth.ts'
            });
            expect(metrics.activity[0]?.startTime.toISOString()).toBe('2026-04-19T10:00:00.000Z');
        });

        it('marks paired start/end rows as completed', () => {
            writeLines('s-pair', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-pair',
                    tool_name: 'Read',
                    category: 'builtin',
                    event: 'start',
                    tool_use_id: 'u1'
                },
                {
                    timestamp: '2026-04-19T10:00:05.000Z',
                    session_id: 's-pair',
                    tool_name: 'Read',
                    category: 'builtin',
                    event: 'end',
                    tool_use_id: 'u1'
                }
            ]);

            const metrics = getToolCountMetrics('s-pair');
            expect(metrics.totalInvocations).toBe(1);  // end event does not recount
            expect(metrics.activity).toHaveLength(1);
            expect(metrics.activity[0]?.status).toBe('completed');
            expect(metrics.activity[0]?.endTime?.toISOString()).toBe('2026-04-19T10:00:05.000Z');
        });

        it('ignores orphan end events and skips rows without tool_use_id', () => {
            writeLines('s-sparse', [
                {
                    timestamp: 't1',
                    session_id: 's-sparse',
                    tool_name: 'Bash',
                    category: 'builtin'
                },
                {
                    timestamp: 't2',
                    session_id: 's-sparse',
                    tool_name: 'Read',
                    category: 'builtin',
                    event: 'end',
                    tool_use_id: 'orphan'
                }
            ]);

            const metrics = getToolCountMetrics('s-sparse');
            expect(metrics.totalInvocations).toBe(1);  // Bash row counts; orphan end does not
            expect(metrics.activity).toEqual([]);
        });

        it('includes Agent tool in activity (render layer filters it)', () => {
            writeLines('s-agent', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-agent',
                    tool_name: 'Agent',
                    category: 'builtin',
                    event: 'start',
                    tool_use_id: 'u1',
                    target: 'explore'
                }
            ]);

            const metrics = getToolCountMetrics('s-agent');
            expect(metrics.activity).toHaveLength(1);
            expect(metrics.activity[0]?.tool_name).toBe('Agent');
        });

        it('sorts activity by startTime ascending and caps at 20', () => {
            const records: unknown[] = [];
            for (let i = 0; i < 25; i += 1) {
                records.push({
                    timestamp: new Date(Date.UTC(2026, 3, 19, 10, i, 0)).toISOString(),
                    session_id: 's-cap',
                    tool_name: 'Read',
                    category: 'builtin',
                    event: 'start',
                    tool_use_id: `u${i}`
                });
            }
            writeLines('s-cap', records);

            const metrics = getToolCountMetrics('s-cap');
            expect(metrics.activity).toHaveLength(20);
            expect(metrics.activity[0]?.id).toBe('u5');
            expect(metrics.activity[19]?.id).toBe('u24');
        });

        it('skips malformed JSON lines', () => {
            const filePath = getToolCountFilePath('s-bad');
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const valid = JSON.stringify({ timestamp: 't1', session_id: 's-bad', tool_name: 'Edit', category: 'builtin' });
            fs.writeFileSync(filePath, `${valid}\nnot-json\n`, 'utf-8');

            expect(getToolCountMetrics('s-bad').totalInvocations).toBe(1);
        });
    });

    describe('extractTarget', () => {
        it('extracts file_path for editor tools', () => {
            expect(extractTarget('Edit', { file_path: '/a.ts' })).toBe('/a.ts');
            expect(extractTarget('Write', { file_path: '/a.ts' })).toBe('/a.ts');
            expect(extractTarget('Read', { file_path: '/a.ts' })).toBe('/a.ts');
        });

        it('extracts path then pattern for Grep/Glob', () => {
            expect(extractTarget('Grep', { path: '/src', pattern: 'foo' })).toBe('/src');
            expect(extractTarget('Grep', { pattern: 'foo' })).toBe('foo');
        });

        it('extracts url for WebFetch', () => {
            expect(extractTarget('WebFetch', { url: 'https://example.com' })).toBe('https://example.com');
        });

        it('returns undefined for Bash (no stable target)', () => {
            expect(extractTarget('Bash', { command: 'ls -la' })).toBeUndefined();
        });

        it('returns undefined for unknown tools', () => {
            expect(extractTarget('mcp__foo__bar', { some: 'thing' })).toBeUndefined();
        });

        it('is defensive against non-object input', () => {
            expect(extractTarget('Edit', null)).toBeUndefined();
            expect(extractTarget('Edit', 'string')).toBeUndefined();
        });
    });

    describe('basename', () => {
        it('returns last path segment for unix paths', () => {
            expect(basename('/repo/src/auth.ts')).toBe('auth.ts');
        });

        it('normalizes windows backslashes', () => {
            expect(basename('C:\\repo\\src\\auth.ts')).toBe('auth.ts');
        });

        it('returns url host for http(s) urls', () => {
            expect(basename('https://example.com/path?x=1')).toBe('example.com');
        });

        it('falls back to the original string for bare names', () => {
            expect(basename('README.md')).toBe('README.md');
        });
    });
});