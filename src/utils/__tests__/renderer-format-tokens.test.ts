import {
    describe,
    expect,
    it
} from 'vitest';

import { formatTokens } from '../renderer';

describe('formatTokens', () => {
    it('returns the bare number below 1000', () => {
        expect(formatTokens(0)).toBe('0');
        expect(formatTokens(42)).toBe('42');
        expect(formatTokens(999)).toBe('999');
    });

    it('formats thousands with one decimal and a k suffix', () => {
        expect(formatTokens(1000)).toBe('1.0k');
        expect(formatTokens(5160)).toBe('5.2k');
        expect(formatTokens(25443)).toBe('25.4k');
    });

    it('formats millions with one decimal and an M suffix', () => {
        expect(formatTokens(1000000)).toBe('1.0M');
        expect(formatTokens(1147000)).toBe('1.1M');
    });

    it('promotes to M when the k value would round up to 1000.0 (regression)', () => {
        // 999_950–999_999 previously rendered as "1000.0k" instead of "1.0M".
        expect(formatTokens(999950)).toBe('1.0M');
        expect(formatTokens(999999)).toBe('1.0M');
    });

    it('still renders just below the boundary as k', () => {
        expect(formatTokens(999949)).toBe('999.9k');
    });

    it('uses whole-number k and rolls up to M at decimals=0', () => {
        expect(formatTokens(711000, {}, 0)).toBe('711k');
        expect(formatTokens(999499, {}, 0)).toBe('999k');
        expect(formatTokens(999500, {}, 0)).toBe('1.0M');
        expect(formatTokens(1000000, {}, 0)).toBe('1.0M');
    });
});
