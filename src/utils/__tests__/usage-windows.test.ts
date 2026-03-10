import {
    describe,
    expect,
    it
} from 'vitest';

import { getUsageErrorMessage, formatUsageDuration } from '../usage-windows';

describe('getUsageErrorMessage', () => {
    it('returns the rate-limited label', () => {
        expect(getUsageErrorMessage('rate-limited')).toBe('[Rate limited]');
    });
});

describe('formatUsageDuration', () => {
    it('formats minutes only', () => {
        expect(formatUsageDuration(30 * 60 * 1000)).toBe('0hr 30m');
    });

    it('formats hours only', () => {
        expect(formatUsageDuration(2 * 60 * 60 * 1000)).toBe('2hr');
    });

    it('formats hours and minutes', () => {
        expect(formatUsageDuration(2.5 * 60 * 60 * 1000)).toBe('2hr 30m');
    });

    it('formats days when >= 24 hours', () => {
        // 36 hours 30 minutes
        const ms = (36 * 60 + 30) * 60 * 1000;
        expect(formatUsageDuration(ms)).toBe('1d 12hr 30m');
    });

    it('formats days without minutes', () => {
        const ms = 48 * 60 * 60 * 1000;
        expect(formatUsageDuration(ms)).toBe('2d');
    });

    it('formats days only (exact multiple)', () => {
        const ms = 24 * 60 * 60 * 1000;
        expect(formatUsageDuration(ms)).toBe('1d');
    });

    // Compact mode
    it('compact: formats hours and minutes', () => {
        expect(formatUsageDuration(2.5 * 60 * 60 * 1000, true)).toBe('2h30m');
    });

    it('compact: formats days', () => {
        const ms = (36 * 60 + 30) * 60 * 1000;
        expect(formatUsageDuration(ms, true)).toBe('1d12h30m');
    });

    it('compact: formats days without minutes', () => {
        const ms = 48 * 60 * 60 * 1000;
        expect(formatUsageDuration(ms, true)).toBe('2d0h');
    });

    it('handles zero duration', () => {
        expect(formatUsageDuration(0)).toBe('0hr');
        expect(formatUsageDuration(0, true)).toBe('0h');
    });

    it('clamps negative values to zero', () => {
        expect(formatUsageDuration(-1000)).toBe('0hr');
    });
});