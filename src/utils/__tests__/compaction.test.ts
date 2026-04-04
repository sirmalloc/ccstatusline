import {
    describe,
    expect,
    it
} from 'vitest';

import {
    detectCompaction,
    type CompactionState
} from '../compaction';

const fresh: CompactionState = { count: 0, prevCtxPct: 0 };

describe('detectCompaction', () => {
    it('does not detect on first render (no previous state)', () => {
        const result = detectCompaction(40, fresh);
        expect(result.count).toBe(0);
        expect(result.prevCtxPct).toBe(40);
    });

    it('detects compaction when ctx drops by more than 2 points', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(30, prev);
        expect(result.count).toBe(1);
    });

    it('does not detect when ctx drops by exactly 2 points', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(38, prev);
        expect(result.count).toBe(0);
    });

    it('does not detect when ctx drops by 1 point (rounding noise)', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 8 };
        const result = detectCompaction(7, prev);
        expect(result.count).toBe(0);
    });

    it('does not detect when ctx increases', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(45, prev);
        expect(result.count).toBe(0);
    });

    it('does not detect when ctx stays the same', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(40, prev);
        expect(result.count).toBe(0);
    });

    it('detects 3-point drop on 1M window', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 8 };
        const result = detectCompaction(5, prev);
        expect(result.count).toBe(1);
    });

    it('detects large compaction on 200K window', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 85 };
        const result = detectCompaction(30, prev);
        expect(result.count).toBe(1);
    });

    it('increments existing count', () => {
        const prev: CompactionState = { count: 3, prevCtxPct: 70 };
        const result = detectCompaction(40, prev);
        expect(result.count).toBe(4);
    });

    it('updates prevCtxPct regardless of detection', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(45, prev);
        expect(result.prevCtxPct).toBe(45);
    });

    it('accepts custom threshold', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 10 };
        // 1-point drop with threshold=1 should detect
        const result = detectCompaction(8, prev, 1);
        expect(result.count).toBe(1);
    });
});
