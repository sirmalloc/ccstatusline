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