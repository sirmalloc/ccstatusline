import {
    describe,
    expect,
    it
} from 'vitest';

import {
    applyColors,
    getColorAnsiCode
} from '../colors';

describe('applyColors with gradient foreground', () => {
    it('renders a per-character gradient at truecolor with a single trailing reset', () => {
        const out = applyColors('ABCD', 'gradient:retro', undefined, false, 'truecolor');
        const codes = out.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? [];
        expect(codes.length).toBe(4);
        // at least two distinct colors across the gradient
        expect(new Set(codes).size).toBeGreaterThan(1);
        // exactly one foreground reset, at the very end
        expect(out.match(/\x1b\[39m/g) ?? []).toHaveLength(1);
        expect(out.endsWith('\x1b[39m')).toBe(true);
    });

    it('keeps bold and background wrapping around the gradient body', () => {
        // Use a hex background so the code is produced deterministically regardless of
        // chalk.level (named colors emit nothing when chalk.level is 0, as in tests).
        const out = applyColors('AB', 'gradient:ff0000-0000ff', 'hex:0000ff', true, 'truecolor');
        expect(out.startsWith('\x1b[1m')).toBe(true); // bold opens first
        expect(out).toContain('\x1b[48;2;0;0;255m'); // background code present
        expect(out).toContain('\x1b[49m'); // background reset present
        expect(out).toContain('\x1b[22m'); // bold reset present
        expect(out).toContain('\x1b[39m'); // foreground reset present
    });

    it('falls back to a solid first stop at ansi16', () => {
        const out = applyColors('ABCD', 'gradient:ff0000-0000ff', undefined, false, 'ansi16');
        const codes = out.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? [];
        // single solid color for the whole text (first stop #ff0000)
        expect(codes).toHaveLength(1);
        expect(codes[0]).toBe('\x1b[38;2;255;0;0m');
    });
});

describe('getColorAnsiCode with gradient (powerline path)', () => {
    it('returns the first stop as a single truecolor code', () => {
        expect(getColorAnsiCode('gradient:ff0000-0000ff', 'truecolor', false)).toBe('\x1b[38;2;255;0;0m');
    });

    it('returns a 256-color code at ansi256 level', () => {
        expect(getColorAnsiCode('gradient:ff0000-0000ff', 'ansi256', false)).toBe('\x1b[38;5;196m');
    });

    it('returns empty string for an invalid gradient spec', () => {
        expect(getColorAnsiCode('gradient:nope', 'truecolor', false)).toBe('');
    });
});
