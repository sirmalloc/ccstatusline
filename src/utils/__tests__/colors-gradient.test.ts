import {
    describe,
    expect,
    it
} from 'vitest';

import {
    applyColors,
    getColorAnsiCode
} from '../colors';

const TRUECOLOR_CODE = /\x1b\[38;2;\d+;\d+;\d+m/g;
const ANSI256_CODE = /\x1b\[38;5;\d+m/g;

function countMatches(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length ?? 0;
}

describe('applyColors with a per-widget gradient foreground', () => {
    const gradient = 'gradient:FF0000-0000FF';

    it('paints each visible character at truecolor and closes with a reset', () => {
        const out = applyColors('abcd', gradient, undefined, false, 'truecolor');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(4);
        expect(out.endsWith('\x1b[39m')).toBe(true);
    });

    it('uses 256-color escapes at ansi256 level', () => {
        const out = applyColors('abc', gradient, undefined, false, 'ansi256');
        expect(countMatches(out, ANSI256_CODE)).toBe(3);
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(0);
    });

    it('emits no gradient color at ansi16', () => {
        const out = applyColors('abcd', gradient, undefined, false, 'ansi16');
        expect(out).toBe('abcd');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(0);
        expect(countMatches(out, ANSI256_CODE)).toBe(0);
    });

    it('preserves a resolvable named preset', () => {
        const out = applyColors('hello', 'gradient:atlas', undefined, false, 'truecolor');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(5);
    });
});

// Widgets that color some runs themselves (Widget.colorsOnlyItsRuns) end each
// run with \x1b[39m and leave the rest of their text to the renderer
describe('applyColors around runs the text colors itself', () => {
    const runs = 'ab \x1b[31mxy\x1b[39m cd';

    it('returns to the solid foreground after each run', () => {
        const base = '\x1b[38;2;17;34;51m';

        expect(applyColors(runs, 'hex:112233', undefined, false, 'truecolor', undefined, true))
            .toBe(`${base}ab \x1b[31mxy${base} cd\x1b[39m`);
    });

    it('sweeps a gradient across the rest of the text and leaves the runs alone', () => {
        const out = applyColors(runs, 'gradient:FF0000-0000FF', undefined, false, 'truecolor', undefined, true);

        expect(out).toContain('\x1b[31mxy\x1b[39m');
        expect(out.startsWith('\x1b[38;2;255;0;0ma')).toBe(true);
        expect(out).toContain('\x1b[38;2;0;0;255md\x1b[39m');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(4);
    });

    it('leaves embedded runs as they are unless asked', () => {
        const out = applyColors(runs, 'gradient:FF0000-0000FF', undefined, false, 'truecolor');

        expect(countMatches(out, TRUECOLOR_CODE)).toBe(6);
        expect(applyColors(runs, 'hex:112233', undefined, false, 'truecolor'))
            .toBe(`\x1b[38;2;17;34;51m${runs}\x1b[39m`);
    });
});

describe('getColorAnsiCode gradient first-stop fallback (powerline / ansi16 path)', () => {
    it('collapses a gradient to its first stop as a solid foreground', () => {
        expect(getColorAnsiCode('gradient:FF0000-0000FF', 'truecolor', false)).toBe('\x1b[38;2;255;0;0m');
    });

    it('honors the background flag', () => {
        expect(getColorAnsiCode('gradient:FF0000-0000FF', 'truecolor', true)).toBe('\x1b[48;2;255;0;0m');
    });

    it('maps the first stop into the 256-color palette at ansi256', () => {
        expect(getColorAnsiCode('gradient:FF0000-0000FF', 'ansi256', false)).toBe('\x1b[38;5;196m');
    });

    it('returns empty at ansi16 so gradients do not leak higher color levels', () => {
        expect(getColorAnsiCode('gradient:FF0000-0000FF', 'ansi16', false)).toBe('');
        expect(getColorAnsiCode('gradient:FF0000-0000FF', 'ansi16', true)).toBe('');
    });

    it('returns empty for an unparseable gradient spec', () => {
        expect(getColorAnsiCode('gradient:not-a-color', 'truecolor', false)).toBe('');
    });
});

describe('getColorAnsiCode custom colors at ansi16 (Basic / No Color)', () => {
    it('returns empty for hex and ansi256 colors, as for gradients', () => {
        expect(getColorAnsiCode('hex:FF0000', 'ansi16', false)).toBe('');
        expect(getColorAnsiCode('hex:0000FF', 'ansi16', true)).toBe('');
        expect(getColorAnsiCode('ansi256:100', 'ansi16', false)).toBe('');
        expect(getColorAnsiCode('ansi256:100', 'ansi16', true)).toBe('');
    });

    it('still emits them at 256-color and truecolor levels', () => {
        expect(getColorAnsiCode('ansi256:100', 'ansi256', false)).toBe('\x1b[38;5;100m');
        expect(getColorAnsiCode('hex:0000FF', 'truecolor', true)).toBe('\x1b[48;2;0;0;255m');
    });
});

describe('getColorAnsiCode hex colors at ansi256 (256 Color)', () => {
    it('maps a hex color to the nearest 256-color palette entry', () => {
        expect(getColorAnsiCode('hex:FF8800', 'ansi256', false)).toBe('\x1b[38;5;208m');
        expect(getColorAnsiCode('hex:FF8800', 'ansi256', true)).toBe('\x1b[48;5;208m');
        expect(getColorAnsiCode('hex:4e9a06', 'ansi256', false)).toBe('\x1b[38;5;64m');
        expect(getColorAnsiCode('hex:808080', 'ansi256', false)).toBe('\x1b[38;5;244m');
    });

    it('maps a hex color that is a palette entry to that entry', () => {
        expect(getColorAnsiCode('hex:5f5f5f', 'ansi256', false)).toBe('\x1b[38;5;59m');
        expect(getColorAnsiCode('hex:FF0000', 'ansi256', false)).toBe('\x1b[38;5;196m');
    });

    it('sends no truecolor escape for a hex foreground through applyColors', () => {
        const out = applyColors('high', 'hex:ff8800', undefined, false, 'ansi256');
        expect(out).toBe('\x1b[38;5;208mhigh\x1b[39m');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(0);
    });

    it('keeps the exact hex color at truecolor', () => {
        expect(getColorAnsiCode('hex:FF8800', 'truecolor', false)).toBe('\x1b[38;2;255;136;0m');
    });
});
