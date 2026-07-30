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

    describe('collapsed to a single color', () => {
        // A powerline segment carries one foreground code for its whole text, so the powerline
        // renderer asks getColorAnsiCode for a gradient rather than painting per character.
        // collapseGradient lets a caller reproduce that without re-deriving the first stop, which
        // is where a hand-rolled hex: conversion drifts: it emits truecolor at every color level.
        it('emits one truecolor code for the first stop', () => {
            const out = applyColors('abcd', gradient, undefined, false, 'truecolor', undefined, true);
            expect(countMatches(out, TRUECOLOR_CODE)).toBe(1);
            expect(out).toContain('\x1b[38;2;255;0;0m');
        });

        it('emits a 256-color escape at ansi256, not truecolor', () => {
            const out = applyColors('abc', gradient, undefined, false, 'ansi256', undefined, true);
            expect(countMatches(out, ANSI256_CODE)).toBe(1);
            expect(countMatches(out, TRUECOLOR_CODE)).toBe(0);
        });

        it('emits no color at ansi16, where a gradient is a no-op', () => {
            const out = applyColors('abcd', gradient, undefined, false, 'ansi16', undefined, true);
            expect(out).toBe('abcd');
        });
    });

    it('preserves a resolvable named preset', () => {
        const out = applyColors('hello', 'gradient:atlas', undefined, false, 'truecolor');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(5);
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
