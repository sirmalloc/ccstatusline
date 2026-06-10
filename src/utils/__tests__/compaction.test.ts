import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    countCompactionsInLines,
    getCompactionCount
} from '../compaction';

describe('countCompactionsInLines', () => {
    it('returns 0 for no compaction markers', () => {
        const lines = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 100 } } })
        ];
        expect(countCompactionsInLines(lines)).toBe(0);
    });

    it('counts each compact_boundary system record', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 179004 } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 20000 } } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 837327, postTokens: 25443 } })
        ];
        expect(countCompactionsInLines(lines)).toBe(2);
    });

    it('counts exactly one compaction despite transient 0% context frames (supersedes #370)', () => {
        // The old heuristic over-counted here: each 0% frame then a real reading
        // looked like a drop. The marker scan is immune by construction.
        const lines = [
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 150000 } } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 0 } } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 150000, postTokens: 20000 } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 0 } } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 20000 } } })
        ];
        expect(countCompactionsInLines(lines)).toBe(1);
    });

    it('ignores other system records and malformed lines', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'something_else' }),
            '{ this is not valid json',
            '',
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } })
        ];
        expect(countCompactionsInLines(lines)).toBe(1);
    });

    it('does not count a non-system record that merely has the subtype string', () => {
        const lines = [
            JSON.stringify({ type: 'user', subtype: 'compact_boundary' })
        ];
        expect(countCompactionsInLines(lines)).toBe(0);
    });

    it('does not count a sidechain (subagent) compact_boundary record', () => {
        // Ground truth 2026-06-10: subagent compactions write compact_boundary
        // with isSidechain:true (observed in subagents/agent-*.jsonl). Only the
        // user's main-chain compactions should count.
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', isSidechain: true, compactMetadata: { trigger: 'auto', preTokens: 50000 } })
        ];
        expect(countCompactionsInLines(lines)).toBe(0);
    });
});

describe('getCompactionCount', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compaction-count-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns 0 when the transcript file does not exist', async () => {
        await expect(getCompactionCount(path.join(dir, 'missing.jsonl'))).resolves.toBe(0);
    });

    it('counts compact_boundary records in a real-shaped transcript', async () => {
        const file = path.join(dir, 'session.jsonl');
        const content = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: 'start' } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 837327, postTokens: 25443 }, version: '2.1.161' }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 25443 } } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 912661, postTokens: 30026 }, version: '2.1.161' })
        ].join('\n') + '\n';
        fs.writeFileSync(file, content);
        await expect(getCompactionCount(file)).resolves.toBe(2);
    });

    it('returns 0 when the transcript path is not a readable file', async () => {
        await expect(getCompactionCount(dir)).resolves.toBe(0);
    });
});
