import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    GlobalNumberFormat,
    NumberFormat
} from '../../types/NumberFormat';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { formatTokens } from '../format-tokens';
import {
    formatCost,
    formatPercent,
    renderMagnitude,
    resolveNumberFormat
} from '../number-format';
import { formatSpeed } from '../speed-metrics';

describe('renderMagnitude', () => {
    const cases: { value: number; format: NumberFormat; baseline: number; expected: string }[] = [
        { value: 1, format: {}, baseline: 1, expected: '1.0' },
        { value: 1, format: { style: 'compact' }, baseline: 1, expected: '1' },
        { value: 1.1, format: { style: 'compact' }, baseline: 1, expected: '1.1' },
        { value: 512, format: { style: 'compact' }, baseline: 1, expected: '512' },
        { value: 1, format: { decimals: 2 }, baseline: 1, expected: '1.00' },
        { value: 1.149, format: { style: 'whole' }, baseline: 1, expected: '1' },
        { value: 12, format: {}, baseline: 0, expected: '12' },
        { value: 12, format: { decimals: 1 }, baseline: 0, expected: '12.0' }
    ];

    it.each(cases)('value $value with $format over baseline $baseline -> $expected', ({ value, format, baseline, expected }) => {
        expect(renderMagnitude(value, format, baseline)).toBe(expected);
    });
});

describe('formatPercent', () => {
    it('keeps one decimal by default (unchanged)', () => {
        expect(formatPercent(84.5)).toBe('84.5%');
        expect(formatPercent(100)).toBe('100.0%');
    });

    it('compact trims a pointless trailing zero', () => {
        expect(formatPercent(100, { style: 'compact' })).toBe('100%');
        expect(formatPercent(84.5, { style: 'compact' })).toBe('84.5%');
    });

    it('whole rounds to an integer', () => {
        expect(formatPercent(84.4, { style: 'whole' })).toBe('84%');
        expect(formatPercent(99.9, { style: 'whole' })).toBe('100%');
    });
});

describe('formatCost', () => {
    it('keeps two decimals by default (money, unchanged)', () => {
        expect(formatCost(1.2)).toBe('$1.20');
        expect(formatCost(2.45)).toBe('$2.45');
    });

    it('honors an explicit override', () => {
        expect(formatCost(1.2, { style: 'compact' })).toBe('$1.2');
        expect(formatCost(1, { style: 'whole' })).toBe('$1');
    });
});

describe('resolveNumberFormat', () => {
    const widget = (numberFormat?: NumberFormat): WidgetItem => ({
        id: 'w',
        type: 'tokens-input',
        ...(numberFormat ? { numberFormat } : {})
    });
    const withGlobal = (numberFormat: GlobalNumberFormat) => ({ ...DEFAULT_SETTINGS, numberFormat });

    it('returns an empty format when nothing is set (current behavior)', () => {
        expect(resolveNumberFormat('token', widget(), DEFAULT_SETTINGS)).toEqual({});
    });

    it('uses the per-widget value when no global is set', () => {
        expect(resolveNumberFormat('token', widget({ style: 'compact' }), DEFAULT_SETTINGS)).toEqual({ style: 'compact' });
    });

    it('lets a global for the kind win over the per-widget value', () => {
        const settings = withGlobal({ token: { style: 'whole' } });
        expect(resolveNumberFormat('token', widget({ style: 'compact' }), settings)).toEqual({ style: 'whole' });
    });

    it('ignores a global set for a different kind', () => {
        const settings = withGlobal({ cost: { style: 'whole' } });
        expect(resolveNumberFormat('token', widget({ style: 'compact' }), settings)).toEqual({ style: 'compact' });
    });
});

describe('formatTokens with a format', () => {
    it('compact trims pointless trailing zeros', () => {
        expect(formatTokens(1000000, { style: 'compact' })).toBe('1M');
        expect(formatTokens(1147000, { style: 'compact' })).toBe('1.1M');
        expect(formatTokens(512000, { style: 'compact' })).toBe('512k');
    });

    it('whole drops decimals and still promotes to M correctly', () => {
        expect(formatTokens(1000000, { style: 'whole' })).toBe('1M');
        expect(formatTokens(999600, { style: 'whole' })).toBe('1M');
    });

    it('decimals widens precision', () => {
        expect(formatTokens(1000000, { decimals: 2 })).toBe('1.00M');
    });

    it('default (no format) is unchanged', () => {
        expect(formatTokens(1000000)).toBe('1.0M');
        expect(formatTokens(512000)).toBe('512.0k');
    });
});

describe('formatSpeed with a format', () => {
    it('compact trims trailing zeros', () => {
        expect(formatSpeed(1000, { style: 'compact' })).toBe('1k t/s');
        expect(formatSpeed(50, { style: 'compact' })).toBe('50 t/s');
    });

    it('default is unchanged', () => {
        expect(formatSpeed(1000)).toBe('1.0k t/s');
        expect(formatSpeed(50)).toBe('50.0 t/s');
        expect(formatSpeed(null)).toBe('—');
    });
});
