import {
    describe,
    expect,
    test
} from 'vitest';

import {
    parseBooleanString,
    parseCurrency,
    parseIntSafe,
    parsePercentage,
    parseSpeed,
    parseTokenCount
} from '../value-parsers';

describe('parsePercentage', () => {
    test('parses valid percentage strings', () => {
        expect(parsePercentage('9.3%')).toBe(9.3);
        expect(parsePercentage('100%')).toBe(100);
        expect(parsePercentage('0%')).toBe(0);
        expect(parsePercentage('0.5%')).toBe(0.5);
    });

    test('parses numbers without percent sign', () => {
        expect(parsePercentage('42.5')).toBe(42.5);
        expect(parsePercentage('100')).toBe(100);
    });

    test('returns null for invalid inputs', () => {
        expect(parsePercentage('')).toBe(null);
        expect(parsePercentage('abc')).toBe(null);
        expect(parsePercentage('12.3.4%')).toBe(null);
        expect(parsePercentage('%')).toBe(null);
    });
});

describe('parseCurrency', () => {
    test('parses currency with dollar sign', () => {
        expect(parseCurrency('$2.45')).toBe(2.45);
        expect(parseCurrency('$100.00')).toBe(100);
        expect(parseCurrency('$0.01')).toBe(0.01);
    });

    test('parses currency with various symbols', () => {
        expect(parseCurrency('€10.00')).toBe(10);
        expect(parseCurrency('£99.99')).toBe(99.99);
        expect(parseCurrency('¥1000')).toBe(1000);
    });

    test('parses numbers without currency symbol', () => {
        expect(parseCurrency('42.50')).toBe(42.5);
        expect(parseCurrency('100')).toBe(100);
    });

    test('returns null for invalid inputs', () => {
        expect(parseCurrency('')).toBe(null);
        expect(parseCurrency('abc')).toBe(null);
        expect(parseCurrency('$')).toBe(null);
        expect(parseCurrency('€')).toBe(null);
    });
});

describe('parseTokenCount', () => {
    test('parses numbers with K suffix', () => {
        expect(parseTokenCount('15.2k')).toBe(15200);
        expect(parseTokenCount('15.2K')).toBe(15200);
        expect(parseTokenCount('1k')).toBe(1000);
        expect(parseTokenCount('0.5K')).toBe(500);
    });

    test('parses numbers with M suffix', () => {
        expect(parseTokenCount('1.5M')).toBe(1500000);
        expect(parseTokenCount('1.5m')).toBe(1500000);
        expect(parseTokenCount('2M')).toBe(2000000);
        expect(parseTokenCount('0.1m')).toBe(100000);
    });

    test('parses numbers with B suffix', () => {
        expect(parseTokenCount('1.5B')).toBe(1500000000);
        expect(parseTokenCount('1.5b')).toBe(1500000000);
        expect(parseTokenCount('1B')).toBe(1000000000);
    });

    test('parses plain numbers without suffix', () => {
        expect(parseTokenCount('42')).toBe(42);
        expect(parseTokenCount('1000')).toBe(1000);
        expect(parseTokenCount('0')).toBe(0);
    });

    test('returns null for invalid inputs', () => {
        expect(parseTokenCount('')).toBe(null);
        expect(parseTokenCount('abc')).toBe(null);
        expect(parseTokenCount('k')).toBe(null);
        expect(parseTokenCount('1.2.3k')).toBe(null);
    });
});

describe('parseSpeed', () => {
    test('parses valid speed strings', () => {
        expect(parseSpeed('85.2 t/s')).toBe(85.2);
        expect(parseSpeed('100 t/s')).toBe(100);
        expect(parseSpeed('0 t/s')).toBe(0);
        expect(parseSpeed('0.5 t/s')).toBe(0.5);
    });

    test('parses numbers without suffix', () => {
        expect(parseSpeed('42.5')).toBe(42.5);
        expect(parseSpeed('100')).toBe(100);
    });

    test('returns null for invalid inputs', () => {
        expect(parseSpeed('')).toBe(null);
        expect(parseSpeed('abc')).toBe(null);
        expect(parseSpeed('t/s')).toBe(null);
        expect(parseSpeed('12.3.4 t/s')).toBe(null);
    });
});

describe('parseBooleanString', () => {
    test('parses true strings', () => {
        expect(parseBooleanString('true')).toBe(true);
        expect(parseBooleanString('True')).toBe(true);
        expect(parseBooleanString('TRUE')).toBe(true);
    });

    test('parses false strings', () => {
        expect(parseBooleanString('false')).toBe(false);
        expect(parseBooleanString('False')).toBe(false);
        expect(parseBooleanString('FALSE')).toBe(false);
    });

    test('returns null for non-boolean strings', () => {
        expect(parseBooleanString('')).toBe(null);
        expect(parseBooleanString('yes')).toBe(null);
        expect(parseBooleanString('no')).toBe(null);
        expect(parseBooleanString('1')).toBe(null);
        expect(parseBooleanString('0')).toBe(null);
        expect(parseBooleanString('abc')).toBe(null);
    });
});

describe('parseIntSafe', () => {
    test('parses valid integer strings', () => {
        expect(parseIntSafe('42')).toBe(42);
        expect(parseIntSafe('0')).toBe(0);
        expect(parseIntSafe('-10')).toBe(-10);
        expect(parseIntSafe('1000')).toBe(1000);
    });

    test('returns null for floating-point numbers', () => {
        expect(parseIntSafe('42.5')).toBe(null);
        expect(parseIntSafe('0.1')).toBe(null);
        expect(parseIntSafe('-10.5')).toBe(null);
    });

    test('returns null for invalid inputs', () => {
        expect(parseIntSafe('')).toBe(null);
        expect(parseIntSafe('abc')).toBe(null);
        expect(parseIntSafe('12abc')).toBe(null);
        expect(parseIntSafe('12.3.4')).toBe(null);
    });
});
