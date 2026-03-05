import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    getSessionDuration,
    getSpeedMetrics,
    getSpeedMetricsCollection,
    getTokenMetrics
} from '../jsonl';

function makeUsageLine(params: {
    timestamp: string;
    input: number;
    output: number;
    cacheRead?: number;
    cacheCreate?: number;
    isSidechain?: boolean;
    isApiErrorMessage?: boolean;
}): string {
    return JSON.stringify({
        timestamp: params.timestamp,
        isSidechain: params.isSidechain,
        isApiErrorMessage: params.isApiErrorMessage,
        message: {
            usage: {
                input_tokens: params.input,
                output_tokens: params.output,
                cache_read_input_tokens: params.cacheRead,
                cache_creation_input_tokens: params.cacheCreate
            }
        }
    });
}

function makeTranscriptLine(params: {
    timestamp: string;
    type: 'user' | 'assistant';
    input?: number;
    output?: number;
    isSidechain?: boolean;
    isApiErrorMessage?: boolean;
}): string {
    return JSON.stringify({
        timestamp: params.timestamp,
        type: params.type,
        isSidechain: params.isSidechain,
        isApiErrorMessage: params.isApiErrorMessage,
        message: typeof params.input === 'number' || typeof params.output === 'number'
            ? {
                usage: {
                    input_tokens: params.input ?? 0,
                    output_tokens: params.output ?? 0
                }
            }
            : undefined
    });
}

describe('jsonl transcript metrics', () => {
    const tempRoots: string[] = [];

    afterEach(() => {
        while (tempRoots.length > 0) {
            const root = tempRoots.pop();
            if (root) {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    });

    it('formats session duration as <1m for sub-minute transcripts', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'short.jsonl');
        fs.writeFileSync(transcriptPath, [
            JSON.stringify({ timestamp: '2026-01-01T10:00:00.000Z' }),
            JSON.stringify({ timestamp: '2026-01-01T10:00:30.000Z' })
        ].join('\n'));

        const duration = await getSessionDuration(transcriptPath);

        expect(duration).toBe('<1m');
    });

    it('formats multi-hour session durations', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'long.jsonl');
        fs.writeFileSync(transcriptPath, [
            JSON.stringify({ timestamp: '2026-01-01T10:00:00.000Z' }),
            JSON.stringify({ timestamp: '2026-01-01T12:05:00.000Z' })
        ].join('\n'));

        const duration = await getSessionDuration(transcriptPath);

        expect(duration).toBe('2hr 5m');
    });

    it('returns null for missing transcript files', async () => {
        const duration = await getSessionDuration('/tmp/ccstatusline-jsonl-metrics-missing.jsonl');
        expect(duration).toBeNull();
    });

    it('aggregates token totals and computes context length from the latest main-chain non-error entry', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tokens.jsonl');

        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 100,
                output: 50,
                cacheRead: 20,
                cacheCreate: 10
            }),
            makeUsageLine({
                timestamp: '2026-01-01T11:00:00.000Z',
                input: 200,
                output: 80,
                cacheRead: 30,
                cacheCreate: 20
            }),
            makeUsageLine({
                timestamp: '2026-01-01T11:30:00.000Z',
                input: 500,
                output: 10,
                cacheRead: 5,
                cacheCreate: 5,
                isSidechain: true
            }),
            makeUsageLine({
                timestamp: '2026-01-01T11:45:00.000Z',
                input: 999,
                output: 1,
                cacheRead: 1,
                cacheCreate: 1,
                isApiErrorMessage: true
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 1799,
            outputTokens: 141,
            cachedTokens: 92,
            totalTokens: 2032,
            contextLength: 250
        });
    });

    it('returns zeroed token metrics when file is missing', async () => {
        const metrics = await getTokenMetrics('/tmp/ccstatusline-jsonl-metrics-missing.jsonl');
        expect(metrics).toEqual({
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength: 0
        });
    });

    it('calculates speed metrics from user-to-assistant processing windows', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'assistant',
                input: 200,
                output: 100
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:08.000Z',
                type: 'assistant',
                input: 100,
                output: 50
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:04.000Z',
                type: 'assistant',
                input: 300,
                output: 150
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 12000,
            inputTokens: 600,
            outputTokens: 300,
            totalTokens: 900,
            requestCount: 3
        });
    });

    it('calculates windowed speed metrics from recent requests only', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-window.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:10.000Z',
                type: 'assistant',
                input: 100,
                output: 50
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:10.000Z',
                type: 'assistant',
                input: 200,
                output: 100
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:02:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:02:10.000Z',
                type: 'assistant',
                input: 300,
                output: 150
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { windowSeconds: 70 });

        expect(metrics).toEqual({
            totalDurationMs: 20000,
            inputTokens: 500,
            outputTokens: 250,
            totalTokens: 750,
            requestCount: 2
        });
    });

    it('returns session and windowed speed metrics in one collection call', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-window-collection.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:10.000Z',
                type: 'assistant',
                input: 100,
                output: 50
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:40.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:50.000Z',
                type: 'assistant',
                input: 200,
                output: 100
            })
        ].join('\n'));

        const metricsCollection = await getSpeedMetricsCollection(transcriptPath, { windowSeconds: [30, 90] });

        expect(metricsCollection.sessionAverage).toEqual({
            totalDurationMs: 20000,
            inputTokens: 300,
            outputTokens: 150,
            totalTokens: 450,
            requestCount: 2
        });
        expect(metricsCollection.windowed['30']).toEqual({
            totalDurationMs: 10000,
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            requestCount: 1
        });
        expect(metricsCollection.windowed['90']).toEqual({
            totalDurationMs: 20000,
            inputTokens: 300,
            outputTokens: 150,
            totalTokens: 450,
            requestCount: 2
        });
    });

    it('ignores sidechain and API error entries in speed metrics', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-filtering.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                type: 'assistant',
                input: 999,
                output: 999,
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                type: 'assistant',
                input: 500,
                output: 500,
                isApiErrorMessage: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'assistant',
                input: 100,
                output: 50
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 3000,
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            requestCount: 1
        });
    });

    it('does not parse subagent transcripts unless includeSubagents is enabled', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main.jsonl');
        const subagentsDir = path.join(root, 'subagents');
        const subagentTranscriptPath = path.join(subagentsDir, 'agent-1.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                input: 10,
                output: 20
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: '1' }
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(subagentTranscriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:11.000Z',
                type: 'assistant',
                input: 100,
                output: 200,
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 4000,
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            requestCount: 1
        });
    });

    it('aggregates subagent speed metrics with merged active windows when enabled', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-with-subagents.jsonl');
        const subagentsDir = path.join(root, 'subagents');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:10.000Z',
                type: 'assistant',
                input: 50,
                output: 100
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'a' }
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'b' }
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(path.join(subagentsDir, 'agent-a.jsonl'), [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:15.000Z',
                type: 'assistant',
                input: 150,
                output: 300,
                isSidechain: true
            })
        ].join('\n'));
        fs.writeFileSync(path.join(subagentsDir, 'agent-b.jsonl'), [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:20.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:25.000Z',
                type: 'assistant',
                input: 25,
                output: 50,
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { includeSubagents: true });

        expect(metrics).toEqual({
            totalDurationMs: 20000,
            inputTokens: 225,
            outputTokens: 450,
            totalTokens: 675,
            requestCount: 3
        });
    });

    it('applies window filtering to aggregated subagent speed metrics', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-subagent-windowed.jsonl');
        const subagentsDir = path.join(root, 'subagents');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                input: 10,
                output: 20
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'a' }
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(path.join(subagentsDir, 'agent-a.jsonl'), [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:10.000Z',
                type: 'assistant',
                input: 30,
                output: 60,
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, {
            includeSubagents: true,
            windowSeconds: 4
        });

        expect(metrics).toEqual({
            totalDurationMs: 4000,
            inputTokens: 30,
            outputTokens: 60,
            totalTokens: 90,
            requestCount: 1
        });
    });

    it('includes only referenced subagent transcripts from the parent transcript', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-referenced-subagents.jsonl');
        const subagentsDir = path.join(root, 'subagents');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'assistant',
                input: 20,
                output: 30
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'referenced-agent' }
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(path.join(subagentsDir, 'agent-referenced-agent.jsonl'), [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:06.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:08.000Z',
                type: 'assistant',
                input: 10,
                output: 20,
                isSidechain: true
            })
        ].join('\n'));
        fs.writeFileSync(path.join(subagentsDir, 'agent-unrelated-agent.jsonl'), [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:06.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:18.000Z',
                type: 'assistant',
                input: 500,
                output: 900,
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { includeSubagents: true });

        expect(metrics).toEqual({
            totalDurationMs: 7000,
            inputTokens: 30,
            outputTokens: 50,
            totalTokens: 80,
            requestCount: 2
        });
    });

    it('finds subagents in session-directory layout used by Claude transcripts', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const sessionId = 'session-123';
        const transcriptPath = path.join(root, `${sessionId}.jsonl`);
        const subagentsDir = path.join(root, sessionId, 'subagents');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                input: 10,
                output: 20
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'layout-agent' }
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(path.join(subagentsDir, 'agent-layout-agent.jsonl'), [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:08.000Z',
                type: 'assistant',
                input: 15,
                output: 25,
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { includeSubagents: true });

        expect(metrics).toEqual({
            totalDurationMs: 7000,
            inputTokens: 25,
            outputTokens: 45,
            totalTokens: 70,
            requestCount: 2
        });
    });

    it('falls back to main transcript metrics when subagent folder cannot be listed', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-discovery-failure.jsonl');
        const subagentsPath = path.join(root, 'subagents');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'assistant',
                input: 30,
                output: 60
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'unreadable' }
            })
        ].join('\n'));

        // Create a regular file where the subagents directory is expected.
        fs.writeFileSync(subagentsPath, 'not-a-directory');

        const metrics = await getSpeedMetrics(transcriptPath, { includeSubagents: true });

        expect(metrics).toEqual({
            totalDurationMs: 3000,
            inputTokens: 30,
            outputTokens: 60,
            totalTokens: 90,
            requestCount: 1
        });
    });

    it('ignores malformed subagent lines without failing', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-malformed-subagent.jsonl');
        const subagentsDir = path.join(root, 'subagents');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                type: 'assistant',
                input: 10,
                output: 20
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'malformed' }
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(path.join(subagentsDir, 'agent-malformed.jsonl'), [
            'not-json',
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:07.000Z',
                type: 'assistant',
                input: 5,
                output: 15,
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { includeSubagents: true });

        expect(metrics).toEqual({
            totalDurationMs: 6000,
            inputTokens: 15,
            outputTokens: 35,
            totalTokens: 50,
            requestCount: 2
        });
    });

    it('falls back to main transcript metrics when subagents directory is missing', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-no-subagents.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'assistant',
                input: 30,
                output: 60
            }),
            JSON.stringify({
                type: 'progress',
                data: { agentId: 'unreadable' }
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { includeSubagents: true });

        expect(metrics).toEqual({
            totalDurationMs: 3000,
            inputTokens: 30,
            outputTokens: 60,
            totalTokens: 90,
            requestCount: 1
        });
    });

    it('ignores unreadable subagent transcript files without failing', async () => {
        if (process.platform === 'win32') {
            expect(true).toBe(true);
            return;
        }

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-main-unreadable-subagent.jsonl');
        const subagentsDir = path.join(root, 'subagents');
        const unreadableSubagentPath = path.join(subagentsDir, 'agent-unreadable.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'assistant',
                input: 30,
                output: 60
            })
        ].join('\n'));

        fs.mkdirSync(subagentsDir, { recursive: true });
        fs.writeFileSync(unreadableSubagentPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'user',
                isSidechain: true
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:06.000Z',
                type: 'assistant',
                input: 100,
                output: 200,
                isSidechain: true
            })
        ].join('\n'));

        fs.chmodSync(unreadableSubagentPath, 0o000);
        const metrics = await (async () => {
            try {
                return await getSpeedMetrics(transcriptPath, { includeSubagents: true });
            } finally {
                fs.chmodSync(unreadableSubagentPath, 0o600);
            }
        })();

        expect(metrics).toEqual({
            totalDurationMs: 3000,
            inputTokens: 30,
            outputTokens: 60,
            totalTokens: 90,
            requestCount: 1
        });
    });

    it('returns empty speed metrics when transcript path points to an unreadable directory', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'not-a-jsonl-file');

        fs.mkdirSync(transcriptPath);

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            requestCount: 0
        });
    });

    it('counts assistant tokens without timestamps while keeping active duration at zero', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-missing-timestamps.jsonl');

        fs.writeFileSync(transcriptPath, [
            JSON.stringify({
                type: 'assistant',
                message: {
                    usage: {
                        input_tokens: 7,
                        output_tokens: 9
                    }
                }
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 0,
            inputTokens: 7,
            outputTokens: 9,
            totalTokens: 16,
            requestCount: 1
        });
    });

    it('returns empty speed metrics when transcript is missing', async () => {
        const metrics = await getSpeedMetrics('/tmp/ccstatusline-jsonl-speed-missing.jsonl');
        expect(metrics).toEqual({
            totalDurationMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            requestCount: 0
        });
    });
});