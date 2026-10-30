import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    SpeedMetrics,
    TokenMetrics
} from '../../types';
import type { StatusJSON } from '../../types/StatusJSON';
import { getContextWindowMetrics } from '../context-window';
import { getTranscriptAnalysis } from '../jsonl';
import type { SpeedMetricsCollection } from '../jsonl-metrics';

// The render path makes one combined scan; these narrow the result to the one
// metric each case is about, so the assertions stay readable.
async function getSessionDuration(transcriptPath: string): Promise<string | null> {
    const analysis = await getTranscriptAnalysis(transcriptPath, { includeSessionDuration: true });
    return analysis.sessionDuration;
}

async function getTokenMetrics(transcriptPath: string): Promise<TokenMetrics> {
    const analysis = await getTranscriptAnalysis(transcriptPath);
    return analysis.tokenMetrics;
}

async function getSpeedMetricsCollection(
    transcriptPath: string,
    options: { includeSubagents?: boolean; windowSeconds?: number[] } = {}
): Promise<SpeedMetricsCollection> {
    const analysis = await getTranscriptAnalysis(transcriptPath, {
        includeSpeedMetrics: true,
        includeSubagents: options.includeSubagents,
        speedWindowSeconds: options.windowSeconds
    });
    if (!analysis.speedMetricsCollection) {
        throw new Error('speed metrics were requested but not collected');
    }

    return analysis.speedMetricsCollection;
}

async function getSpeedMetrics(
    transcriptPath: string,
    options: { includeSubagents?: boolean; windowSeconds?: number } = {}
): Promise<SpeedMetrics> {
    const { windowSeconds } = options;
    const collection = await getSpeedMetricsCollection(transcriptPath, {
        includeSubagents: options.includeSubagents,
        windowSeconds: windowSeconds === undefined ? [] : [windowSeconds]
    });

    return windowSeconds === undefined
        ? collection.sessionAverage
        : collection.windowed[windowSeconds.toString()] ?? collection.sessionAverage;
}

function makeUsageLine(params: {
    timestamp: string;
    input: number;
    output: number;
    cacheRead?: number;
    cacheCreate?: number;
    isSidechain?: boolean;
    isApiErrorMessage?: boolean;
    stopReason?: string | null;
    messageId?: string;
}): string {
    return JSON.stringify({
        timestamp: params.timestamp,
        isSidechain: params.isSidechain,
        isApiErrorMessage: params.isApiErrorMessage,
        message: {
            id: params.messageId,
            stop_reason: params.stopReason,
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
    messageId?: string;
}): string {
    return JSON.stringify({
        timestamp: params.timestamp,
        type: params.type,
        isSidechain: params.isSidechain,
        isApiErrorMessage: params.isApiErrorMessage,
        message: typeof params.input === 'number' || typeof params.output === 'number'
            ? {
                id: params.messageId,
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

    it('clamps malformed usage counts the way the live status path does', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'malformed-usage.jsonl');
        const usage = {
            input_tokens: '12',
            output_tokens: -7,
            cache_read_input_tokens: 5000,
            cache_creation_input_tokens: 100
        };
        fs.writeFileSync(transcriptPath, `${JSON.stringify({
            timestamp: '2026-01-01T10:00:00.000Z',
            message: { stop_reason: 'end_turn', usage }
        })}\n`);

        const metrics = await getTokenMetrics(transcriptPath);
        const live = getContextWindowMetrics({ context_window: { current_usage: usage } } as unknown as StatusJSON);

        // A non-numeric or negative count reads as 0 in both paths, so the
        // transcript fallback can never disagree with the live status JSON.
        expect(metrics.inputTokens).toBe(0);
        expect(metrics.outputTokens).toBe(0);
        expect(metrics.contextLength).toBe(5100);
        expect(metrics.contextLength).toBe(live.contextLengthTokens);
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
            cacheReadTokens: 56,
            cacheCreationTokens: 36,
            totalTokens: 2032,
            contextLength: 250
        });
    });

    it('ignores invalid timestamps when choosing the latest context usage', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'invalid-timestamp.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeUsageLine({
                timestamp: 'not-a-timestamp',
                input: 100,
                output: 1
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 5,
                output: 2,
                cacheRead: 5000
            })
        ].join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics.contextLength).toBe(5005);
        expect(metrics.totalTokens).toBe(5108);
    });

    it('skips intermediate streaming entries and only counts final entries per API call', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'streaming.jsonl');

        // Simulate two API calls, each with intermediate streaming entries (stop_reason: null)
        // and a final entry (stop_reason: "tool_use" or "end_turn")
        const lines = [
            // API call 1: two intermediates + one final
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 1,
                output: 30,
                cacheRead: 12000,
                cacheCreate: 11000,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 1,
                output: 30,
                cacheRead: 12000,
                cacheCreate: 11000,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                input: 1,
                output: 150,
                cacheRead: 12000,
                cacheCreate: 11000,
                stopReason: 'tool_use'
            }),
            // API call 2: one intermediate + one final
            makeUsageLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                input: 1,
                output: 25,
                cacheRead: 23000,
                cacheCreate: 500,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                input: 1,
                output: 400,
                cacheRead: 23000,
                cacheCreate: 500,
                stopReason: 'end_turn'
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        // Should only count the two final entries, not the three intermediates
        expect(metrics).toEqual({
            inputTokens: 2,           // 1 + 1
            outputTokens: 550,        // 150 + 400
            cachedTokens: 46500,      // (12000 + 11000) + (23000 + 500)
            cacheReadTokens: 35000,   // 12000 + 23000
            cacheCreationTokens: 11500, // 11000 + 500
            totalTokens: 47052,       // 2 + 550 + 46500
            contextLength: 23501      // last main-chain final entry: 1 + 23000 + 500
        });
    });

    it('counts a split response once when every record repeats the same usage', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'split-response.jsonl');

        // Main transcripts write one record per content block and repeat the
        // response's final usage and stop_reason on each of them.
        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 150,
                cacheRead: 12000,
                cacheCreate: 11000,
                stopReason: 'tool_use'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 150,
                cacheRead: 12000,
                cacheCreate: 11000,
                stopReason: 'tool_use'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 150,
                cacheRead: 12000,
                cacheCreate: 11000,
                stopReason: 'tool_use'
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 1,
            outputTokens: 150,
            cachedTokens: 23000,
            cacheReadTokens: 12000,
            cacheCreationTokens: 11000,
            totalTokens: 23151,
            contextLength: 23001
        });
    });

    it('counts the final usage of a split response whose earlier records are zeroed', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'split-response-settling.jsonl');

        // A response can log a partial usage before it settles; the record written
        // last holds the final count either way.
        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 0,
                stopReason: 'tool_use'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 150,
                stopReason: 'tool_use'
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics.inputTokens).toBe(1);
        expect(metrics.outputTokens).toBe(150);
        expect(metrics.totalTokens).toBe(151);
    });

    it('replaces a counted response when its final record is still in progress', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'split-response-in-progress.jsonl');

        // The settled record is counted by the scan; the later in-progress record
        // of the same response supersedes it instead of adding to it.
        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 150,
                stopReason: 'tool_use'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 300,
                stopReason: null
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics.inputTokens).toBe(1);
        expect(metrics.outputTokens).toBe(300);
    });

    it('drops a fallback response share once stop_reason data starts', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'split-response-fallback.jsonl');

        // Without stop_reason every record counts. The first record carrying the
        // field resets those totals, so a response spanning the change is not
        // counted through both its fallback share and its final usage.
        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                messageId: 'msg-1',
                input: 5,
                output: 50
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                messageId: 'msg-1',
                input: 1,
                output: 150,
                stopReason: 'tool_use'
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics.inputTokens).toBe(1);
        expect(metrics.outputTokens).toBe(150);
    });

    it('counts the latest in-progress streaming entry once when no finalized row exists yet', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'streaming-in-progress.jsonl');

        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 4,
                output: 40,
                cacheRead: 1000,
                cacheCreate: 200,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                input: 4,
                output: 90,
                cacheRead: 1000,
                cacheCreate: 200,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                input: 4,
                output: 140,
                cacheRead: 1000,
                cacheCreate: 200,
                stopReason: null
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 4,
            outputTokens: 140,
            cachedTokens: 1200,
            cacheReadTokens: 1000,
            cacheCreationTokens: 200,
            totalTokens: 1344,
            contextLength: 1204
        });
    });

    it('counts finalized streaming entries plus the latest unfinished one during live updates', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'streaming-live-update.jsonl');

        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 2,
                output: 25,
                cacheRead: 100,
                cacheCreate: 50,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                input: 2,
                output: 80,
                cacheRead: 100,
                cacheCreate: 50,
                stopReason: 'end_turn'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                input: 3,
                output: 30,
                cacheRead: 200,
                cacheCreate: 25,
                stopReason: null
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                input: 3,
                output: 120,
                cacheRead: 200,
                cacheCreate: 25,
                stopReason: null
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 5,
            outputTokens: 200,
            cachedTokens: 375,
            cacheReadTokens: 300,
            cacheCreationTokens: 75,
            totalTokens: 580,
            contextLength: 228
        });
    });

    it('deduplicates cumulative token totals across one API call’s per-content-block entries', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'cumulative-dedup.jsonl');

        // A #549-shaped transcript: msg_01 writes three per-content-block
        // entries with identical prompt-side usage and growing output_tokens,
        // so the cumulative widgets must count the call once, not once per
        // block (sirmalloc/ccstatusline#549).
        fs.writeFileSync(transcriptPath, [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 10,
                output: 5,
                cacheRead: 100,
                cacheCreate: 0,
                stopReason: 'end_turn',
                messageId: 'msg_00'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:01:00.000Z',
                input: 2,
                output: 1,
                cacheRead: 3978,
                cacheCreate: 12278,
                stopReason: 'tool_use',
                messageId: 'msg_01'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:01:00.000Z',
                input: 2,
                output: 100,
                cacheRead: 3978,
                cacheCreate: 12278,
                stopReason: 'tool_use',
                messageId: 'msg_01'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:01:01.000Z',
                input: 2,
                output: 287,
                cacheRead: 3978,
                cacheCreate: 12278,
                stopReason: 'tool_use',
                messageId: 'msg_01'
            })
        ].join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 12,            // 10 + 2 (msg_01 counted once)
            outputTokens: 292,          // 5 + 287 (finalized output wins)
            cachedTokens: 16356,        // (100 + 0) + (3978 + 12278)
            cacheReadTokens: 4078,      // 100 + 3978
            cacheCreationTokens: 12278, // 0 + 12278
            totalTokens: 16660,         // 12 + 292 + 16356
            contextLength: 16258        // 2 + 3978 + 12278
        });
    });

    it('resolves streaming partials to their finalized values in cumulative totals', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'cumulative-streaming-dedup.jsonl');

        // Same shape as the live-update case, but every entry carries a
        // message.id: msg_a's partials must collapse into its finalized entry,
        // and msg_b's in-flight partials must count once, not per partial.
        fs.writeFileSync(transcriptPath, [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 2,
                output: 25,
                cacheRead: 100,
                cacheCreate: 50,
                stopReason: null,
                messageId: 'msg_a'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:01.000Z',
                input: 2,
                output: 80,
                cacheRead: 100,
                cacheCreate: 50,
                stopReason: 'end_turn',
                messageId: 'msg_a'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                input: 3,
                output: 30,
                cacheRead: 200,
                cacheCreate: 25,
                stopReason: null,
                messageId: 'msg_b'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                input: 3,
                output: 120,
                cacheRead: 200,
                cacheCreate: 25,
                stopReason: null,
                messageId: 'msg_b'
            })
        ].join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 5,          // 2 + 3, one call each
            outputTokens: 200,       // 80 + 120, not 25+80 or 30+120
            cachedTokens: 375,
            cacheReadTokens: 300,
            cacheCreationTokens: 75,
            totalTokens: 580,
            contextLength: 228
        });
    });

    it('counts a sidechain call’s per-content-block entries once in cumulative totals', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'cumulative-sidechain-dedup.jsonl');

        // Sidechain rows keep their treatment in the cumulative sums (still
        // included, still excluded from context length); grouping by their own
        // message.id must not count one subagent call per content block.
        fs.writeFileSync(transcriptPath, [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 10,
                output: 50,
                cacheRead: 20,
                cacheCreate: 10,
                stopReason: 'end_turn',
                messageId: 'msg_main'
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:01:00.000Z',
                input: 900,
                output: 400,
                cacheRead: 5000,
                cacheCreate: 100,
                stopReason: 'tool_use',
                messageId: 'msg_sub',
                isSidechain: true
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:01:01.000Z',
                input: 900,
                output: 650,
                cacheRead: 5000,
                cacheCreate: 100,
                stopReason: 'tool_use',
                messageId: 'msg_sub',
                isSidechain: true
            })
        ].join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 910,          // 10 + 900 (sidechain call counted once)
            outputTokens: 700,         // 50 + 650
            cachedTokens: 5130,        // (20 + 10) + (5000 + 100)
            cacheReadTokens: 5020,     // 20 + 5000
            cacheCreationTokens: 110,  // 10 + 100
            totalTokens: 6740,         // 910 + 700 + 5130
            contextLength: 40          // main-chain msg_main only
        });
    });

    it('falls back to counting all entries when no stop_reason data is present', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'legacy.jsonl');

        // Older transcript format without stop_reason
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
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        // Should count all entries since none have stop_reason
        expect(metrics).toEqual({
            inputTokens: 300,
            outputTokens: 130,
            cachedTokens: 80,
            cacheReadTokens: 50,
            cacheCreationTokens: 30,
            totalTokens: 510,
            contextLength: 250
        });
    });

    it('reports post-compaction context length from the boundary marker before the next turn', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'compact-boundary.jsonl');

        // A large pre-compaction turn, then Claude Code's compact_boundary marker.
        // The pre-compaction entry describes a context that no longer exists, so
        // context length must reflect the boundary's postTokens (18000), not the
        // stale 235000 the last usage entry would otherwise produce.
        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 5000,
                output: 100,
                cacheRead: 190000,
                cacheCreate: 40000,
                stopReason: 'end_turn'
            }),
            JSON.stringify({
                type: 'system',
                subtype: 'compact_boundary',
                timestamp: '2026-01-01T10:05:00.000Z',
                compactMetadata: { trigger: 'manual', preTokens: 235100, postTokens: 18000 }
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        // Totals stay cumulative for the session; only contextLength resets.
        expect(metrics).toEqual({
            inputTokens: 5000,
            outputTokens: 100,
            cachedTokens: 230000,
            cacheReadTokens: 190000,
            cacheCreationTokens: 40000,
            totalTokens: 235100,
            contextLength: 18000
        });
    });

    it('uses the first turn after a compaction boundary instead of its postTokens estimate', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'compact-followup.jsonl');

        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 5000,
                output: 100,
                cacheRead: 190000,
                cacheCreate: 40000,
                stopReason: 'end_turn'
            }),
            JSON.stringify({
                type: 'system',
                subtype: 'compact_boundary',
                timestamp: '2026-01-01T10:05:00.000Z',
                compactMetadata: { trigger: 'manual', preTokens: 235100, postTokens: 18000 }
            }),
            makeUsageLine({
                timestamp: '2026-01-01T10:06:00.000Z',
                input: 200,
                output: 50,
                cacheRead: 17000,
                cacheCreate: 500,
                stopReason: 'end_turn'
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        // contextLength = post-compaction turn (200 + 17000 + 500), not 18000 or 235000.
        expect(metrics).toEqual({
            inputTokens: 5200,
            outputTokens: 150,
            cachedTokens: 247500,
            cacheReadTokens: 207000,
            cacheCreationTokens: 40500,
            totalTokens: 252850,
            contextLength: 17700
        });
    });

    it('reports zero context length after a compaction marker that omits postTokens with no following turn', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'compact-no-post-tokens.jsonl');

        // Older transcript format: a compact_boundary without postTokens. The
        // pre-compaction context is gone and we have no post-compaction size, so
        // the stale 235000 must not leak through.
        const lines = [
            makeUsageLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                input: 5000,
                output: 100,
                cacheRead: 190000,
                cacheCreate: 40000,
                stopReason: 'end_turn'
            }),
            JSON.stringify({
                type: 'system',
                subtype: 'compact_boundary',
                timestamp: '2026-01-01T10:05:00.000Z',
                compactMetadata: { trigger: 'manual', preTokens: 235100 }
            })
        ];

        fs.writeFileSync(transcriptPath, lines.join('\n'));

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: 5000,
            outputTokens: 100,
            cachedTokens: 230000,
            cacheReadTokens: 190000,
            cacheCreationTokens: 40000,
            totalTokens: 235100,
            contextLength: 0
        });
    });

    it('returns zeroed token metrics when file is missing', async () => {
        const metrics = await getTokenMetrics('/tmp/ccstatusline-jsonl-metrics-missing.jsonl');
        expect(metrics).toEqual({
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            totalTokens: 0,
            contextLength: 0
        });
    });

    it('aggregates token metrics across many usage records', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'streamed-tokens.jsonl');

        // Many small lines keep the cumulative totals easy to assert while
        // exercising repeated record aggregation.
        const lineCount = 2500;
        const handle = fs.openSync(transcriptPath, 'w');
        try {
            for (let i = 0; i < lineCount; i++) {
                fs.writeSync(handle, `${makeUsageLine({
                    timestamp: `2026-01-01T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
                    input: 2,
                    output: 3,
                    cacheRead: 4,
                    cacheCreate: 1,
                    stopReason: 'end_turn'
                })}\n`);
            }
        } finally {
            fs.closeSync(handle);
        }

        const metrics = await getTokenMetrics(transcriptPath);

        expect(metrics).toEqual({
            inputTokens: lineCount * 2,
            outputTokens: lineCount * 3,
            cachedTokens: lineCount * 5,
            cacheReadTokens: lineCount * 4,
            cacheCreationTokens: lineCount * 1,
            totalTokens: lineCount * 10,
            contextLength: 2 + 4 + 1
        });
    }, 30000);

    it('aggregates usage rows containing multi-megabyte assistant content', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'large-assistant-content.jsonl');
        const content = 'x'.repeat(2 * 1024 * 1024);

        fs.writeFileSync(transcriptPath, [
            JSON.stringify({
                timestamp: '2026-01-01T10:00:00.000Z',
                message: {
                    content,
                    stop_reason: 'end_turn',
                    usage: {
                        input_tokens: 2,
                        output_tokens: 3,
                        cache_read_input_tokens: 4,
                        cache_creation_input_tokens: 1
                    }
                }
            }),
            JSON.stringify({
                timestamp: '2026-01-01T10:00:01.000Z',
                message: {
                    content,
                    stop_reason: 'end_turn',
                    usage: {
                        input_tokens: 5,
                        output_tokens: 6,
                        cache_read_input_tokens: 7,
                        cache_creation_input_tokens: 2
                    }
                }
            })
        ].join('\n'));

        await expect(getTokenMetrics(transcriptPath)).resolves.toEqual({
            inputTokens: 7,
            outputTokens: 9,
            cachedTokens: 14,
            cacheReadTokens: 11,
            cacheCreationTokens: 3,
            totalTokens: 30,
            contextLength: 14
        });
    });

    it('keeps token and speed metrics for a transcript with more usage rows than a call takes arguments', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'many-usage-rows.jsonl');

        // More rows than Node (about 125k) or Bun (about 640k) accepts as
        // arguments to a single function call
        const rowCount = 700_000;
        fs.writeFileSync(transcriptPath, `${JSON.stringify({
            type: 'assistant',
            message: {
                usage: {
                    input_tokens: 1,
                    output_tokens: 2
                }
            }
        })}\n`.repeat(rowCount));

        const analysis = await getTranscriptAnalysis(transcriptPath, { includeSpeedMetrics: true });

        expect(analysis.tokenMetrics.outputTokens).toBe(rowCount * 2);
        expect(analysis.speedMetricsCollection?.sessionAverage).toEqual({
            totalDurationMs: 0,
            inputTokens: rowCount,
            outputTokens: rowCount * 2,
            totalTokens: rowCount * 3,
            requestCount: rowCount
        });
    }, 30000);

    it('collects configured transcript metrics in one combined analysis', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'combined.jsonl');

        fs.writeFileSync(transcriptPath, [
            JSON.stringify({
                type: 'user',
                timestamp: '2026-01-01T10:00:00.000Z',
                message: { content: 'hello' }
            }),
            JSON.stringify({
                type: 'assistant',
                timestamp: '2026-01-01T10:01:00.000Z',
                message: {
                    stop_reason: 'end_turn',
                    usage: {
                        input_tokens: 2,
                        output_tokens: 3,
                        cache_read_input_tokens: 4,
                        cache_creation_input_tokens: 1
                    }
                }
            }),
            JSON.stringify({
                type: 'custom-title',
                customTitle: 'Combined Session',
                timestamp: '2026-01-01T10:02:00.000Z'
            }),
            JSON.stringify({
                type: 'system',
                timestamp: '2026-01-01T10:03:00.000Z',
                message: { content: '<local-command-stdout>Set effort level to high</local-command-stdout>' }
            }),
            JSON.stringify({
                type: 'system',
                subtype: 'compact_boundary',
                timestamp: '2026-01-01T10:04:00.000Z',
                compactMetadata: {
                    trigger: 'manual',
                    preTokens: 10,
                    postTokens: 5
                }
            })
        ].join('\n'));

        const analysis = await getTranscriptAnalysis(transcriptPath, {
            includeSessionDuration: true,
            includeSpeedMetrics: true,
            speedWindowSeconds: [300],
            includeCompactionStats: true,
            includeThinkingEffort: true,
            includeSessionName: true
        });

        expect(analysis).toEqual({
            tokenMetrics: {
                inputTokens: 2,
                outputTokens: 3,
                cachedTokens: 5,
                cacheReadTokens: 4,
                cacheCreationTokens: 1,
                totalTokens: 10,
                contextLength: 5
            },
            sessionDuration: '4m',
            speedMetricsCollection: {
                sessionAverage: {
                    totalDurationMs: 60000,
                    inputTokens: 2,
                    outputTokens: 3,
                    totalTokens: 5,
                    requestCount: 1
                },
                windowed: {
                    300: {
                        totalDurationMs: 60000,
                        inputTokens: 2,
                        outputTokens: 3,
                        totalTokens: 5,
                        requestCount: 1
                    }
                }
            },
            compactionData: {
                count: 1,
                byTrigger: { auto: 0, manual: 1, unknown: 0 },
                tokensReclaimed: 5
            },
            thinkingEffort: { value: 'high', known: true },
            sessionName: 'Combined Session'
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

    it('counts one API response once when it is split across content blocks', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-multi-block.jsonl');

        // Claude Code logs one record per content block (thinking / text /
        // tool_use) and repeats that response's usage on every record.
        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 200,
                output: 100
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:06.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 200,
                output: 100
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:07.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 200,
                output: 100
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 7000,
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            requestCount: 1
        });
    });

    it('counts each split API response once across multiple requests', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-multi-response.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 100,
                output: 60
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 100,
                output: 60
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:09.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 150,
                output: 90
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:10.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 150,
                output: 90
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:11.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 150,
                output: 90
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 10000,
            inputTokens: 250,
            outputTokens: 150,
            totalTokens: 400,
            requestCount: 2
        });
    });

    it('counts a split API response once inside a rolling window', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-window-multi-block.jsonl');

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:03.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 100,
                output: 60
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 100,
                output: 60
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:09.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 150,
                output: 90
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:10.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 150,
                output: 90
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:11.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 150,
                output: 90
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { windowSeconds: 5 });

        // msg-2 ran 6s, 5s of it inside the window: 5/6 of its tokens, once
        expect(metrics).toEqual({
            totalDurationMs: 5000,
            inputTokens: 125,
            outputTokens: 75,
            totalTokens: 200,
            requestCount: 1
        });
    });

    it('counts diverging usage from the last record of a response', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-diverging-usage.jsonl');

        // Subagent transcripts zero the usage until the response settles, so only
        // the last record carries the final count. Both records share a timestamp,
        // which also pins the last-write-wins tie-break.
        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 100,
                output: 0
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:05.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 100,
                output: 500
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath);

        expect(metrics).toEqual({
            totalDurationMs: 5000,
            inputTokens: 100,
            outputTokens: 500,
            totalTokens: 600,
            requestCount: 1
        });
    });

    it('keeps the final usage when a window selects only the later records of a response', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-window-straddle.jsonl');

        // msg-1 owns three records. The window drops the first and keeps two, so
        // only the response's final record carries its usage.
        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:02.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 50,
                output: 0
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:04.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 50,
                output: 0
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:06.000Z',
                type: 'assistant',
                messageId: 'msg-1',
                input: 50,
                output: 500
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:09.000Z',
                type: 'assistant',
                messageId: 'msg-2',
                input: 70,
                output: 100
            })
        ].join('\n'));

        const metrics = await getSpeedMetrics(transcriptPath, { windowSeconds: 5 });

        // msg-1's final usage ran 6s, 2s of it inside the window; msg-2 ran 9s,
        // 5s of it inside. Each keeps that share of its tokens
        const inputTokens = 50 * 2 / 6 + 70 * 5 / 9;
        const outputTokens = 500 * 2 / 6 + 100 * 5 / 9;
        expect(metrics).toEqual({
            totalDurationMs: 5000,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            requestCount: 2
        });
    });

    it('counts the entries of one API call once in speed metrics', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-message-id.jsonl');
        const assistantEntry = (timestamp: string, output: number, id: string): string => JSON.stringify({
            timestamp,
            type: 'assistant',
            message: {
                id,
                usage: { input_tokens: 100, output_tokens: output }
            }
        });

        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            // One API call written as one entry per content block
            assistantEntry('2026-01-01T10:00:02.000Z', 10, 'msg_1'),
            assistantEntry('2026-01-01T10:00:04.000Z', 40, 'msg_1'),
            assistantEntry('2026-01-01T10:00:05.000Z', 50, 'msg_1'),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:00.000Z',
                type: 'user'
            }),
            assistantEntry('2026-01-01T10:01:05.000Z', 30, 'msg_2')
        ].join('\n'));

        const analysis = await getTranscriptAnalysis(transcriptPath, { includeSpeedMetrics: true });

        expect(analysis.speedMetricsCollection?.sessionAverage).toEqual({
            totalDurationMs: 10000,
            inputTokens: 200,
            outputTokens: 80,
            totalTokens: 280,
            requestCount: 2
        });
        expect(analysis.tokenMetrics).toMatchObject({
            inputTokens: 200,
            outputTokens: 80,
            totalTokens: 280
        });
    });

    it.each([
        { finalOutput: 20, expectedOutput: 110, middleId: 'b' },
        { finalOutput: 120, expectedOutput: 150, middleId: 'b' },
        { finalOutput: 20, expectedOutput: 110, middleId: undefined }
    ])('deduplicates nonconsecutive responses without losing peak output or counting idle time ($finalOutput, $middleId)', async ({ finalOutput, expectedOutput, middleId }) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'interleaved-responses.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:00.000Z', type: 'user' }),
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:02.000Z', type: 'assistant', messageId: 'a', input: 100, output: 50 }),
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:03.000Z', type: 'assistant', messageId: 'a', input: 100, output: 80 }),
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:04.000Z', type: 'user' }),
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:05.000Z', type: 'assistant', messageId: middleId, input: 200, output: 30 }),
            // A duplicate with an invalid timestamp must not reconnect earlier intervals.
            makeTranscriptLine({ timestamp: '', type: 'assistant', messageId: 'a', input: 100, output: 20 }),
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:06.000Z', type: 'user' }),
            makeTranscriptLine({ timestamp: '2026-01-01T10:00:07.000Z', type: 'assistant', messageId: 'a', input: 100, output: finalOutput })
        ].join('\n'));

        const analysis = await getTranscriptAnalysis(transcriptPath, { includeSpeedMetrics: true, speedWindowSeconds: [3] });
        const totals = { inputTokens: 300, outputTokens: expectedOutput, totalTokens: 300 + expectedOutput };
        expect(analysis.tokenMetrics).toMatchObject({ ...totals, contextLength: 200 });
        expect(analysis.speedMetricsCollection?.sessionAverage).toEqual({ ...totals, requestCount: 2, totalDurationMs: 5000 });
        // a ran 0-3s and 6-7s, 1s of its 4s inside the window: 1/4 of its tokens.
        // The middle response ran 4-5s, all of it inside
        const windowedInput = 100 / 4 + 200;
        const windowedOutput = (expectedOutput - 30) / 4 + 30;
        expect(analysis.speedMetricsCollection?.windowed['3']).toEqual({ inputTokens: windowedInput, outputTokens: windowedOutput, totalTokens: windowedInput + windowedOutput, requestCount: 2, totalDurationMs: 2000 });
    });

    it('does not restore pre-compaction context from a duplicate response', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-metrics-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'duplicate-after-compaction.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeUsageLine({ timestamp: '2026-01-01T10:00:00.000Z', messageId: 'a', input: 100, output: 50, stopReason: 'end_turn' }),
            JSON.stringify({
                type: 'system',
                subtype: 'compact_boundary',
                timestamp: '2026-01-01T10:00:01.000Z',
                compactMetadata: { trigger: 'manual', postTokens: 20 }
            }),
            makeUsageLine({ timestamp: '2026-01-01T10:00:02.000Z', messageId: 'a', input: 100, output: 80, stopReason: 'end_turn' })
        ].join('\n'));
        expect(await getTokenMetrics(transcriptPath)).toMatchObject({ inputTokens: 100, outputTokens: 80, contextLength: 20 });
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

    it('counts only the in-window share of tokens for a request that started before the window', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-speed-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'speed-window-straddle.jsonl');

        // One 80s request at 50 output t/s, then its tool result 5s later, which
        // ends the window. Only the last part of the request falls inside it.
        fs.writeFileSync(transcriptPath, [
            makeTranscriptLine({
                timestamp: '2026-01-01T10:00:00.000Z',
                type: 'user'
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:20.000Z',
                type: 'assistant',
                input: 80,
                output: 4000
            }),
            makeTranscriptLine({
                timestamp: '2026-01-01T10:01:25.000Z',
                type: 'user'
            })
        ].join('\n'));

        const metricsCollection = await getSpeedMetricsCollection(transcriptPath, { windowSeconds: [10, 40] });

        expect(metricsCollection.sessionAverage).toEqual({
            totalDurationMs: 80000,
            inputTokens: 80,
            outputTokens: 4000,
            totalTokens: 4080,
            requestCount: 1
        });
        // 5s of the request's 80s fall inside the 10s window: 1/16 of its tokens
        expect(metricsCollection.windowed['10']).toEqual({
            totalDurationMs: 5000,
            inputTokens: 5,
            outputTokens: 250,
            totalTokens: 255,
            requestCount: 1
        });
        // 35s of its 80s fall inside the 40s window: 7/16 of its tokens
        expect(metricsCollection.windowed['40']).toEqual({
            totalDurationMs: 35000,
            inputTokens: 35,
            outputTokens: 1750,
            totalTokens: 1785,
            requestCount: 1
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

    it.each([undefined, 'shared-id'])('aggregates subagents independently with message id %s', async (messageId) => {
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
                messageId,
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
                messageId,
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
                messageId,
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

        // The subagent request ran 5s, 4s of it inside the window: 4/5 of its tokens
        expect(metrics).toEqual({
            totalDurationMs: 4000,
            inputTokens: 24,
            outputTokens: 48,
            totalTokens: 72,
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
