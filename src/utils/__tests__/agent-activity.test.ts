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
    getAgentActivityFilePath,
    getAgentActivityMetrics
} from '../agent-activity';

let testHomeDir = '';

describe('agent-activity', () => {
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

    describe('getAgentActivityFilePath', () => {
        it('uses ~/.cache/ccstatusline/agent-activity path', () => {
            expect(getAgentActivityFilePath('session-1')).toBe(
                path.join(testHomeDir, '.cache', 'ccstatusline', 'agent-activity', 'agent-activity-session-1.jsonl')
            );
        });
    });

    function writeEvents(sessionId: string, events: unknown[]): void {
        const filePath = getAgentActivityFilePath(sessionId);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, events.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
    }

    describe('getAgentActivityMetrics — basic merging', () => {
        it('returns empty agents when file does not exist', () => {
            expect(getAgentActivityMetrics('session-unknown')).toEqual({ agents: [] });
        });

        it('keeps status=running when only start event exists', () => {
            writeEvents('s-start-only', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-start-only',
                    event: 'start',
                    id: 'tool-1',
                    type: 'explore',
                    model: 'haiku',
                    description: 'Finding auth code'
                }
            ]);

            const result = getAgentActivityMetrics('s-start-only');
            expect(result.agents).toHaveLength(1);
            expect(result.agents[0]).toMatchObject({
                id: 'tool-1',
                type: 'explore',
                model: 'haiku',
                description: 'Finding auth code',
                status: 'running'
            });
            expect(result.agents[0]?.startTime.toISOString()).toBe('2026-04-19T10:00:00.000Z');
            expect(result.agents[0]?.endTime).toBeUndefined();
        });

        it('marks agent completed when matching end event exists', () => {
            writeEvents('s-pair', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-pair',
                    event: 'start',
                    id: 'tool-1',
                    type: 'code-reviewer',
                    model: 'opus'
                },
                {
                    timestamp: '2026-04-19T10:02:30.000Z',
                    session_id: 's-pair',
                    event: 'end',
                    id: 'tool-1'
                }
            ]);

            const result = getAgentActivityMetrics('s-pair');
            expect(result.agents).toHaveLength(1);
            expect(result.agents[0]?.status).toBe('completed');
            expect(result.agents[0]?.endTime?.toISOString()).toBe('2026-04-19T10:02:30.000Z');
        });
    });

    describe('getAgentActivityMetrics — resilience', () => {
        it('ignores orphan end events (no matching start)', () => {
            writeEvents('s-orphan', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-orphan',
                    event: 'end',
                    id: 'tool-1'
                }
            ]);

            expect(getAgentActivityMetrics('s-orphan').agents).toEqual([]);
        });

        it('keeps first start when same id starts twice', () => {
            writeEvents('s-dup', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-dup',
                    event: 'start',
                    id: 'tool-1',
                    type: 'first',
                    model: 'haiku'
                },
                {
                    timestamp: '2026-04-19T10:01:00.000Z',
                    session_id: 's-dup',
                    event: 'start',
                    id: 'tool-1',
                    type: 'second',
                    model: 'opus'
                }
            ]);

            const agents = getAgentActivityMetrics('s-dup').agents;
            expect(agents).toHaveLength(1);
            expect(agents[0]?.type).toBe('first');
            expect(agents[0]?.model).toBe('haiku');
        });

        it('falls back type to "unknown" when missing', () => {
            writeEvents('s-no-type', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-no-type',
                    event: 'start',
                    id: 'tool-1'
                }
            ]);

            expect(getAgentActivityMetrics('s-no-type').agents[0]?.type).toBe('unknown');
        });

        it('leaves model and description undefined when missing', () => {
            writeEvents('s-minimal', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-minimal',
                    event: 'start',
                    id: 'tool-1',
                    type: 'explore'
                }
            ]);

            const agent = getAgentActivityMetrics('s-minimal').agents[0];
            expect(agent?.model).toBeUndefined();
            expect(agent?.description).toBeUndefined();
        });

        it('skips malformed JSON lines', () => {
            const filePath = getAgentActivityFilePath('s-bad');
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const valid = JSON.stringify({
                timestamp: '2026-04-19T10:00:00.000Z',
                session_id: 's-bad',
                event: 'start',
                id: 'tool-1',
                type: 'explore'
            });
            fs.writeFileSync(filePath, `${valid}\n{not-json\n${valid}\n`, 'utf-8');

            expect(getAgentActivityMetrics('s-bad').agents).toHaveLength(1);
        });

        it('filters out events with different session_id', () => {
            writeEvents('s-a', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-b',
                    event: 'start',
                    id: 'tool-1',
                    type: 'explore'
                },
                {
                    timestamp: '2026-04-19T10:01:00.000Z',
                    session_id: 's-a',
                    event: 'start',
                    id: 'tool-2',
                    type: 'code-reviewer'
                }
            ]);

            const agents = getAgentActivityMetrics('s-a').agents;
            expect(agents).toHaveLength(1);
            expect(agents[0]?.id).toBe('tool-2');
        });
    });

    describe('getAgentActivityMetrics — ordering and capacity', () => {
        it('sorts agents by startTime ascending', () => {
            writeEvents('s-order', [
                {
                    timestamp: '2026-04-19T10:02:00.000Z',
                    session_id: 's-order',
                    event: 'start',
                    id: 'late',
                    type: 'b'
                },
                {
                    timestamp: '2026-04-19T10:01:00.000Z',
                    session_id: 's-order',
                    event: 'start',
                    id: 'early',
                    type: 'a'
                }
            ]);

            const agents = getAgentActivityMetrics('s-order').agents;
            expect(agents.map(a => a.id)).toEqual(['early', 'late']);
        });

        it('breaks ties by id ascending when startTime equal', () => {
            writeEvents('s-tie', [
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-tie',
                    event: 'start',
                    id: 'z-agent',
                    type: 'a'
                },
                {
                    timestamp: '2026-04-19T10:00:00.000Z',
                    session_id: 's-tie',
                    event: 'start',
                    id: 'a-agent',
                    type: 'b'
                }
            ]);

            const agents = getAgentActivityMetrics('s-tie').agents;
            expect(agents.map(a => a.id)).toEqual(['a-agent', 'z-agent']);
        });

        it('keeps only the most recent 10 agents', () => {
            const events = [];
            for (let i = 0; i < 15; i += 1) {
                events.push({
                    timestamp: new Date(Date.UTC(2026, 3, 19, 10, i, 0)).toISOString(),
                    session_id: 's-cap',
                    event: 'start',
                    id: `tool-${i}`,
                    type: `t${i}`
                });
            }
            writeEvents('s-cap', events);

            const agents = getAgentActivityMetrics('s-cap').agents;
            expect(agents).toHaveLength(10);
            expect(agents[0]?.id).toBe('tool-5');
            expect(agents[9]?.id).toBe('tool-14');
        });
    });
});