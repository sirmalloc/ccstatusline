import {
    describe,
    expect,
    it
} from 'vitest';

import type { SpeedMetrics } from '../../types/SpeedMetrics';
import {
    calculateInputSpeed,
    calculateOutputSpeed,
    calculateTotalSpeed,
    formatSpeed
} from '../speed-metrics';

function createMetrics(overrides: Partial<SpeedMetrics> = {}): SpeedMetrics {
    return {
        totalDurationMs: 10000,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 5,
        ...overrides
    };
}

describe('speed metrics calculations', () => {
    it('calculateOutputSpeed returns null when duration is zero', () => {
        const result = calculateOutputSpeed(createMetrics({ totalDurationMs: 0 }));
        expect(result).toBeNull();
    });

    it('calculateOutputSpeed computes output tokens per second', () => {
        const result = calculateOutputSpeed(createMetrics({ outputTokens: 750, totalDurationMs: 15000 }));
        expect(result).toBe(50);
    });

    it('calculateInputSpeed returns null when duration is zero', () => {
        const result = calculateInputSpeed(createMetrics({ totalDurationMs: 0 }));
        expect(result).toBeNull();
    });

    it('calculateInputSpeed computes input tokens per second', () => {
        const result = calculateInputSpeed(createMetrics({ inputTokens: 1200, totalDurationMs: 6000 }));
        expect(result).toBe(200);
    });

    it('calculateTotalSpeed returns null when duration is zero', () => {
        const result = calculateTotalSpeed(createMetrics({ totalDurationMs: 0 }));
        expect(result).toBeNull();
    });

    it('calculateTotalSpeed computes total tokens per second from totalTokens', () => {
        const result = calculateTotalSpeed(createMetrics({ totalTokens: 3000, totalDurationMs: 12000 }));
        expect(result).toBe(250);
    });
});

describe('formatSpeed', () => {
    it('formats null as an em dash placeholder', () => {
        expect(formatSpeed(null)).toBe('\u2014');
    });

    it('formats sub-1000 speeds with one decimal place', () => {
        expect(formatSpeed(42.54)).toBe('42.5 t/s');
    });

    it('formats exact threshold values in k notation', () => {
        expect(formatSpeed(1000)).toBe('1.0k t/s');
    });

    it('formats high speeds in k notation with one decimal place', () => {
        expect(formatSpeed(1250)).toBe('1.3k t/s');
    });
});