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
    ZERO_COMPACTION_STATS,
    computeCompactionStats,
    getCompactionStats
} from '../compaction';

describe('computeCompactionStats', () => {
    it('returns zeroed stats for no compaction markers', () => {
        const lines = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 100 } } })
        ];
        expect(computeCompactionStats(lines)).toEqual({
            count: 0,
            byTrigger: { auto: 0, manual: 0, unknown: 0 },
            tokensReclaimed: 0
        });
    });

    it('counts each compact_boundary system record', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 179004 } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 20000 } } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 837327, postTokens: 25443 } })
        ];
        expect(computeCompactionStats(lines).count).toBe(2);
    });

    it('counts exactly one compaction despite transient 0% context frames (supersedes #370)', () => {
        const lines = [
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 150000 } } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 0 } } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 150000, postTokens: 20000 } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 0 } } }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 20000 } } })
        ];
        expect(computeCompactionStats(lines).count).toBe(1);
    });

    it('splits counts by trigger and buckets missing/unknown trigger as unknown', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 1 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 1 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 1 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { preTokens: 1 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'future-mode', preTokens: 1 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary' })
        ];
        const stats = computeCompactionStats(lines);
        expect(stats.byTrigger).toEqual({ auto: 1, manual: 2, unknown: 3 });
        expect(stats.count).toBe(stats.byTrigger.auto + stats.byTrigger.manual + stats.byTrigger.unknown);
    });

    it('sums tokensReclaimed only for markers with both pre and post tokens', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 900000, postTokens: 20000 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 100000, postTokens: 30000 } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 50000 } })
        ];
        // (900000-20000) + (100000-30000) = 880000 + 70000 = 950000; third marker lacks postTokens -> contributes 0
        expect(computeCompactionStats(lines).tokensReclaimed).toBe(950000);
    });

    it('reports tokensReclaimed 0 when no marker has both pre and post tokens', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 50000 } })
        ];
        expect(computeCompactionStats(lines).tokensReclaimed).toBe(0);
    });

    it('floors per-marker tokensReclaimed at 0 when postTokens exceeds preTokens', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 10000, postTokens: 50000 } })
        ];
        expect(computeCompactionStats(lines).tokensReclaimed).toBe(0);
    });

    it('ignores other system records and malformed lines', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'something_else' }),
            '{ this is not valid json',
            '',
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } })
        ];
        expect(computeCompactionStats(lines).count).toBe(1);
    });

    it('does not count a non-system record that merely has the subtype string', () => {
        const lines = [
            JSON.stringify({ type: 'user', subtype: 'compact_boundary' })
        ];
        expect(computeCompactionStats(lines).count).toBe(0);
    });

    it('excludes sidechain (subagent) records from every stat', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', isSidechain: true, compactMetadata: { trigger: 'auto', preTokens: 50000, postTokens: 10000 } })
        ];
        expect(computeCompactionStats(lines)).toEqual({
            count: 0,
            byTrigger: { auto: 0, manual: 0, unknown: 0 },
            tokensReclaimed: 0
        });
    });

    it('counts a compact_boundary record with explicit isSidechain false', () => {
        const lines = [
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', isSidechain: false, compactMetadata: { trigger: 'manual', preTokens: 100000 } })
        ];
        expect(computeCompactionStats(lines).count).toBe(1);
    });
});

describe('getCompactionStats', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compaction-stats-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns zeroed stats when the transcript file does not exist', async () => {
        await expect(getCompactionStats(path.join(dir, 'missing.jsonl'))).resolves.toEqual(ZERO_COMPACTION_STATS);
    });

    it('computes stats from a real-shaped transcript', async () => {
        const file = path.join(dir, 'session.jsonl');
        const content = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: 'start' } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 837327, postTokens: 25443 }, version: '2.1.161' }),
            JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 25443 } } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'auto', preTokens: 912661, postTokens: 30026 }, version: '2.1.161' })
        ].join('\n') + '\n';
        fs.writeFileSync(file, content);
        await expect(getCompactionStats(file)).resolves.toEqual({
            count: 2,
            byTrigger: { auto: 1, manual: 1, unknown: 0 },
            tokensReclaimed: (837327 - 25443) + (912661 - 30026)
        });
    });

    it('returns zeroed stats when the transcript path is not a readable file', async () => {
        await expect(getCompactionStats(dir)).resolves.toEqual(ZERO_COMPACTION_STATS);
    });
});
