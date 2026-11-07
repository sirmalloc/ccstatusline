import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterAll,
    describe,
    expect,
    it
} from 'vitest';

import {
    getTranscriptAnalysis,
    type TranscriptAnalysisOptions
} from '../jsonl-metrics';

// Differential check for the scan's raw-text pre-filter: every transcript is
// compared against a copy whose records each carry an extra, unread field that
// contains every marker the filter looks for and a \u escape (so dropping
// either a marker or the escape guard is caught). That forces the full JSON.parse
// path (and the agentId walk) on every line, which is the unfiltered scan, so
// any record the filter wrongly skips shows up as a difference in the analysis.
// No collector reads the field: `agentId` there is not a string, and the other
// markers are plain values under a key nothing looks up.
const FORCE_PARSE_FIELD = '"_unread":{"usage":0,"agentId":0,"s":"compact_boundary","t":"custom-title","e":"<local-command-stdout>Set ","u":"\\u0041"}';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-prefilter-'));

afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const AGENT_IDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

function pick<T>(random: () => number, values: readonly T[]): T {
    return values[Math.floor(random() * values.length)] as T;
}

function buildRecord(random: () => number, clock: { ms: number }): string {
    clock.ms += Math.floor(random() * 120000);
    const timestamp = pick(random, [
        new Date(clock.ms).toISOString(),
        new Date(clock.ms).toISOString(),
        new Date(clock.ms).toISOString(),
        undefined,
        'not-a-date'
    ]);
    const isSidechain = random() < 0.1 ? true : undefined;
    const usage = {
        input_tokens: Math.floor(random() * 50),
        output_tokens: Math.floor(random() * 3000),
        cache_read_input_tokens: Math.floor(random() * 100000),
        cache_creation_input_tokens: Math.floor(random() * 20000)
    };
    const kind = Math.floor(random() * 16);

    switch (kind) {
        case 0:
        case 1:
        case 2: {
            const message: Record<string, unknown> = { role: 'assistant', content: [{ type: 'text', text: 'hi' }], usage };
            const stopReason = pick(random, ['end_turn', 'tool_use', null, undefined]);
            if (stopReason !== undefined) {
                message.stop_reason = stopReason;
            }
            return JSON.stringify({
                type: 'assistant',
                timestamp,
                isSidechain,
                isApiErrorMessage: random() < 0.05 ? true : undefined,
                message
            });
        }
        case 3:
            return JSON.stringify({
                type: 'user',
                timestamp,
                isSidechain,
                message: { role: 'user', content: [{ type: 'tool_result', content: 'x'.repeat(Math.floor(random() * 400)) }] }
            });
        case 4:
            return JSON.stringify({
                type: 'user',
                timestamp,
                toolUseResult: { agentId: pick(random, AGENT_IDS), status: 'completed' }
            });
        case 5:
            return JSON.stringify({
                type: 'progress',
                timestamp,
                data: { nested: [{ deeper: [{ agentId: pick(random, AGENT_IDS) }] }, { agentId: '  ' }] }
            });
        case 6:
            // Keys and values spelled with \u escapes: only the escape guard catches these.
            return pick(random, [
                `{"type":"user","timestamp":"${new Date(clock.ms).toISOString()}","toolUseResult":{"agent\\u0049d":"${pick(random, AGENT_IDS)}"}}`,
                `{"type":"assistant","timestamp":"${new Date(clock.ms).toISOString()}","message":{"stop_reason":"end_turn","us\\u0061ge":{"input_tokens":7,"output_tokens":9}}}`,
                `{"type":"system","subtype":"compact_bound\\u0061ry","compactMetadata":{"trigger":"auto","preTokens":90000,"postTokens":12000}}`,
                `{"type":"custom\\u002dtitle","customTitle":"escaped title"}`
            ]);
        case 7:
            return JSON.stringify({
                type: 'system',
                subtype: 'compact_boundary',
                isSidechain,
                timestamp,
                compactMetadata: pick(random, [
                    { trigger: 'auto', preTokens: 150000, postTokens: 20000 },
                    { trigger: 'manual', preTokens: 90000, postTokens: 30000 },
                    { trigger: 'other' },
                    undefined
                ])
            });
        case 8:
            return JSON.stringify({
                type: 'user',
                timestamp,
                message: {
                    role: 'user',
                    content: pick(random, [
                        '<local-command-stdout>Set effort level to high</local-command-stdout>',
                        '<local-command-stdout>Set effort level to max (this session only)</local-command-stdout>',
                        '<local-command-stdout>Set model to \u001b[1mOpus 4.6\u001b[22m with medium effort</local-command-stdout>',
                        '<local-command-stdout>Set model to Sonnet</local-command-stdout>',
                        'Set effort level to low'
                    ])
                }
            });
        case 9:
            return JSON.stringify({ type: 'custom-title', customTitle: pick(random, ['first title', 'second title', '']) });
        case 10:
            // Whitespace and key order the writer never produces but JSON allows.
            return `{ "message" : { "usage" : { "input_tokens" : 3 , "output_tokens" : 4 } , "stop_reason" : "end_turn" } , "timestamp" : "${new Date(clock.ms).toISOString()}" }`;
        case 11:
            return pick(random, ['not json', '{"type":"assistant","message":{"usage":', '[1,2,3]', 'null', '"usage"']);
        case 12:
            return JSON.stringify({ type: 'attachment', timestamp, attachment: { type: 'hook_success', content: 'the usage of compact_boundary custom-title agentId words' } });
        case 13:
            return JSON.stringify({ type: 'assistant', timestamp, message: { role: 'assistant', content: 'no usage here' } });
        case 14:
            return JSON.stringify({ type: 'user', timestamp, message: { role: 'user', content: 'plain prompt' } });
        default:
            return JSON.stringify({ type: 'last-prompt', lastPrompt: 'something', timestamp });
    }
}

function withForcedParse(line: string): string {
    try {
        const parsed = JSON.parse(line) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Insert raw text so the other records keep their exact spelling.
            return line.replace(/^\s*\{/, `{${FORCE_PARSE_FIELD},`);
        }
    } catch {
        // Fall through: malformed lines stay malformed but now contain every marker.
    }
    return `${line} ${FORCE_PARSE_FIELD}`;
}

function writeCorpus(name: string, seed: number, recordCount: number): { original: string; forced: string } {
    const random = createRandom(seed);
    const clock = { ms: Date.parse('2026-01-01T00:00:00.000Z') };
    const lines: string[] = [];
    for (let i = 0; i < recordCount; i++) {
        lines.push(buildRecord(random, clock));
    }

    const write = (fileName: string, recordLines: string[]): string => {
        const dir = path.join(root, `${name}-${fileName}`);
        fs.mkdirSync(path.join(dir, 'subagents'), { recursive: true });
        const transcriptPath = path.join(dir, 'session.jsonl');
        const eol = seed % 2 === 0 ? '\r\n' : '\n';
        const bom = seed % 3 === 0 ? '﻿' : '';
        fs.writeFileSync(transcriptPath, `${bom}${recordLines.join(eol)}${eol}`);
        for (const agentId of AGENT_IDS) {
            const subagentLines = [0, 1, 2].map(i => JSON.stringify({
                type: i === 1 ? 'user' : 'assistant',
                isSidechain: true,
                agentId,
                timestamp: new Date(Date.parse('2026-01-01T00:00:00.000Z') + (i * 1000)).toISOString(),
                message: { usage: { input_tokens: 5, output_tokens: 50 } }
            }));
            fs.writeFileSync(path.join(dir, 'subagents', `agent-${agentId}.jsonl`), subagentLines.join('\n'));
        }
        return transcriptPath;
    };

    return {
        original: write('original', lines),
        forced: write('forced', lines.map(withForcedParse))
    };
}

// Session duration forces the full parse just like speed metrics, so speed
// metrics alone cover that path (and the agentId walk it guards).
const FLAGS = [
    'includeSpeedMetrics',
    'includeCompactionStats',
    'includeThinkingEffort',
    'includeSessionName'
] as const;

function optionCombinations(): TranscriptAnalysisOptions[] {
    const combinations: TranscriptAnalysisOptions[] = [];
    for (let mask = 0; mask < (1 << FLAGS.length); mask++) {
        const options: TranscriptAnalysisOptions = { includeSubagents: true, speedWindowSeconds: [60, 600] };
        FLAGS.forEach((flag, index) => {
            options[flag] = (mask & (1 << index)) !== 0;
        });
        combinations.push(options);
    }
    return combinations;
}

describe('transcript scan pre-filter', () => {
    const seeds = [1, 2, 3, 4, 5, 6];

    for (const seed of seeds) {
        it(`matches the unfiltered scan for every option set (seed ${seed})`, async () => {
            const { original, forced } = writeCorpus(`seed-${seed}`, seed, 60 + (seed * 40));

            for (const options of optionCombinations()) {
                const filtered = await getTranscriptAnalysis(original, options);
                const unfiltered = await getTranscriptAnalysis(forced, options);
                expect(filtered, JSON.stringify(options)).toEqual(unfiltered);
            }
        }, 60000);
    }

    it('still reads records whose markers are spelled with \\u escapes', async () => {
        const dir = path.join(root, 'escaped');
        fs.mkdirSync(dir, { recursive: true });
        const transcriptPath = path.join(dir, 'session.jsonl');
        fs.writeFileSync(transcriptPath, [
            '{"type":"assistant","timestamp":"2026-01-01T00:00:00.000Z","message":{"stop_reason":"end_turn","us\\u0061ge":{"input_tokens":7,"output_tokens":9}}}',
            '{"type":"system","subtype":"compact_bound\\u0061ry","compactMetadata":{"trigger":"auto","preTokens":900,"postTokens":100}}',
            '{"type":"custom\\u002dtitle","customTitle":"escaped title"}'
        ].join('\n'));

        const analysis = await getTranscriptAnalysis(transcriptPath, {
            includeCompactionStats: true,
            includeSessionName: true
        });

        expect(analysis.tokenMetrics.inputTokens).toBe(7);
        expect(analysis.compactionData?.count).toBe(1);
        expect(analysis.sessionName).toBe('escaped title');
    });
});
