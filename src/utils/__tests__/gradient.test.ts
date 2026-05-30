import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    applyLineGradient,
    getVisibleWidth
} from '../ansi';
import {
    GRADIENT_PRESET_NAMES,
    applyGradientToText,
    gradientCodeAt,
    isGradientSpec,
    parseGradientSpec,
    rgbToAnsi256,
    sampleGradient
} from '../gradient';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const TRUECOLOR_CODE = /\x1b\[38;2;\d+;\d+;\d+m/g;
const ANSI256_CODE = /\x1b\[38;5;\d+m/g;

function countMatches(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length ?? 0;
}

describe('isGradientSpec', () => {
    it('is true only for gradient: prefixed values', () => {
        expect(isGradientSpec('gradient:atlas')).toBe(true);
        expect(isGradientSpec('gradient:FF0000-0000FF')).toBe(true);
    });

    it('is false for solid colors, empty, and undefined', () => {
        expect(isGradientSpec(undefined)).toBe(false);
        expect(isGradientSpec('')).toBe(false);
        expect(isGradientSpec('hex:FF0000')).toBe(false);
        expect(isGradientSpec('ansi256:120')).toBe(false);
        expect(isGradientSpec('cyan')).toBe(false);
    });
});

describe('parseGradientSpec', () => {
    it('returns null for non-gradient values', () => {
        expect(parseGradientSpec(undefined)).toBeNull();
        expect(parseGradientSpec('')).toBeNull();
        expect(parseGradientSpec('hex:FF0000')).toBeNull();
        expect(parseGradientSpec('cyan')).toBeNull();
    });

    it('returns null when fewer than two stops resolve', () => {
        expect(parseGradientSpec('gradient:hex:FF0000')).toBeNull();
        expect(parseGradientSpec('gradient:not-a-color,also-bad')).toBeNull();
    });

    it('parses hex, #hex, and bare hex stops (whitespace tolerant)', () => {
        const stops = parseGradientSpec('gradient: hex:FF0000 , #00FF00 , 0000FF ');
        expect(stops).toEqual([
            { r: 255, g: 0, b: 0 },
            { r: 0, g: 255, b: 0 },
            { r: 0, g: 0, b: 255 }
        ]);
    });

    it('parses dash-separated bare hex stops', () => {
        const stops = parseGradientSpec('gradient:FF0000-0000FF');
        expect(stops).toEqual([
            { r: 255, g: 0, b: 0 },
            { r: 0, g: 0, b: 255 }
        ]);
    });

    it('parses dash-separated #-prefixed stops', () => {
        const stops = parseGradientSpec('gradient:#FF0000-#0000FF');
        expect(stops).toEqual([
            { r: 255, g: 0, b: 0 },
            { r: 0, g: 0, b: 255 }
        ]);
    });

    it('resolves named presets (case-insensitive) to their stop list', () => {
        const retro = parseGradientSpec('gradient:retro');
        expect(retro).toHaveLength(9);
        expect(parseGradientSpec('gradient:RAINBOW')).toHaveLength(7);
        // every shipped preset resolves to >= 2 usable stops
        for (const name of GRADIENT_PRESET_NAMES) {
            expect((parseGradientSpec(`gradient:${name}`) ?? []).length).toBeGreaterThanOrEqual(2);
        }
    });
});

describe('applyGradientToText', () => {
    const stops = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }];

    it('emits one code per non-whitespace character and leaves whitespace uncolored', () => {
        const out = applyGradientToText('ab cd', stops, 'truecolor');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(4);
        // the space follows the visible char directly, with no color code in between
        expect(out).toContain('b ');
    });

    it('emits no trailing reset (the caller appends it)', () => {
        const out = applyGradientToText('abc', stops, 'truecolor');
        expect(out.endsWith('\x1b[39m')).toBe(false);
    });

    it('restarts the sweep per call (first visible code identical for two calls)', () => {
        const first = applyGradientToText('abc', stops, 'truecolor').match(TRUECOLOR_CODE)?.[0];
        const second = applyGradientToText('xyz', stops, 'truecolor').match(TRUECOLOR_CODE)?.[0];
        expect(first).toBe(second);
    });

    it('is a no-op for ansi16, empty, and blank-only text', () => {
        expect(applyGradientToText('abc', stops, 'ansi16')).toBe('abc');
        expect(applyGradientToText('', stops, 'truecolor')).toBe('');
        expect(applyGradientToText('   ', stops, 'truecolor')).toBe('   ');
    });
});

describe('sampleGradient', () => {
    it('returns the endpoints (within OKLab round-trip tolerance)', () => {
        const stops = [{ r: 10, g: 20, b: 30 }, { r: 200, g: 150, b: 100 }];
        const start = sampleGradient(stops, 0);
        const end = sampleGradient(stops, 1);
        expect(Math.abs(start.r - 10)).toBeLessThanOrEqual(2);
        expect(Math.abs(end.b - 100)).toBeLessThanOrEqual(2);
    });

    it('produces a neutral mid-gray at the midpoint of black->white', () => {
        const mid = sampleGradient([{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }], 0.5);
        expect(mid.r).toBe(mid.g);
        expect(mid.g).toBe(mid.b);
        expect(mid.r).toBeGreaterThan(80);
        expect(mid.r).toBeLessThan(180);
    });

    it('clamps out-of-range positions', () => {
        const stops = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];
        expect(sampleGradient(stops, -1)).toEqual(sampleGradient(stops, 0));
        expect(sampleGradient(stops, 2)).toEqual(sampleGradient(stops, 1));
    });

    it('lands on the interior stop of a 3-stop gradient at its position', () => {
        // t=0.5 across three stops brackets exactly on the middle stop (green).
        const mid = sampleGradient([{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }], 0.5);
        expect(Math.abs(mid.r - 0)).toBeLessThanOrEqual(2);
        expect(Math.abs(mid.g - 255)).toBeLessThanOrEqual(2);
        expect(Math.abs(mid.b - 0)).toBeLessThanOrEqual(2);
    });
});

describe('rgbToAnsi256', () => {
    it('maps pure colors to the expected palette indices', () => {
        expect(rgbToAnsi256({ r: 0, g: 0, b: 0 })).toBe(16);
        expect(rgbToAnsi256({ r: 255, g: 255, b: 255 })).toBe(231);
        expect(rgbToAnsi256({ r: 255, g: 0, b: 0 })).toBe(196);
    });

    it('maps mid grays into the grayscale ramp', () => {
        const index = rgbToAnsi256({ r: 128, g: 128, b: 128 });
        expect(index).toBeGreaterThanOrEqual(232);
        expect(index).toBeLessThanOrEqual(255);
    });
});

describe('gradientCodeAt', () => {
    const stops = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }];

    it('emits a truecolor escape at truecolor level', () => {
        expect(gradientCodeAt(stops, 0, 'truecolor')).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
    });

    it('emits a 256-color escape at ansi256 level', () => {
        expect(gradientCodeAt(stops, 0.5, 'ansi256')).toMatch(/^\x1b\[38;5;\d+m$/);
    });

    it('falls back to the 256-color path defensively at ansi16', () => {
        // Callers degrade before this, but if reached, ansi16 must not emit truecolor.
        expect(gradientCodeAt(stops, 0.5, 'ansi16')).toMatch(/^\x1b\[38;5;\d+m$/);
    });
});

describe('applyLineGradient', () => {
    const stops = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];

    it('preserves visible width when coloring a styled line', () => {
        const line = '\x1b[38;2;255;0;0mhello\x1b[39m world';
        const out = applyLineGradient(line, stops, 'truecolor');
        expect(getVisibleWidth(out)).toBe(getVisibleWidth(line));
    });

    it('emits one foreground code per visible cluster', () => {
        const out = applyLineGradient('abcdef', stops, 'truecolor');
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(getVisibleWidth('abcdef'));
    });

    it('sweeps through distinct colors across the line', () => {
        const out = applyLineGradient('abcdefghij', stops, 'truecolor');
        const codes = out.match(TRUECOLOR_CODE) ?? [];
        expect(new Set(codes).size).toBeGreaterThanOrEqual(2);
    });

    it('passes OSC 8 hyperlinks through untouched', () => {
        const link = '\x1b]8;;https://example.com\x1b\\branch\x1b]8;;\x1b\\';
        const out = applyLineGradient(`a${link}b`, stops, 'truecolor');
        expect(out).toContain('https://example.com');
        expect(out).toContain('\x1b]8;;\x1b\\');
        expect(getVisibleWidth(out)).toBe(getVisibleWidth(`a${link}b`));
    });

    it('colors both ends of a two-cluster line (denominator of exactly 1)', () => {
        // totalWidth 2 -> denominator 1: first cluster at t=0, second at t=1.
        const out = applyLineGradient('ab', stops, 'truecolor');
        const codes = out.match(TRUECOLOR_CODE) ?? [];
        expect(codes.length).toBe(2);
        expect(codes[0]).not.toBe(codes[1]);
        expect(getVisibleWidth(out)).toBe(2);
    });

    it('uses 256-color escapes at ansi256 level', () => {
        const out = applyLineGradient('abc', stops, 'ansi256');
        expect(countMatches(out, ANSI256_CODE)).toBe(3);
        expect(countMatches(out, TRUECOLOR_CODE)).toBe(0);
    });

    it('is a no-op for ansi16, single-character, and empty lines', () => {
        expect(applyLineGradient('abc', stops, 'ansi16')).toBe('abc');
        expect(applyLineGradient('x', stops, 'truecolor')).toBe('x');
        expect(applyLineGradient('', stops, 'truecolor')).toBe('');
    });
});

describe('renderStatusLine with a gradient override', () => {
    function createSettings(overrides: Partial<Settings> = {}): Settings {
        return {
            ...DEFAULT_SETTINGS,
            flexMode: 'full',
            colorLevel: 3,
            ...overrides,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                ...(overrides.powerline ?? {})
            }
        };
    }

    function renderLine(widgets: WidgetItem[], settingsOverrides: Partial<Settings> = {}, terminalWidth = 200): string {
        const settings = createSettings(settingsOverrides);
        const context: RenderContext = { isPreview: false, terminalWidth };
        const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
        return renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], preCalculatedMaxWidths);
    }

    const widgets: WidgetItem[] = [
        { id: 'a', type: 'custom-text', customText: 'model', color: 'hex:A89278' },
        { id: 'b', type: 'custom-text', customText: ' branch', color: 'hex:A89278' }
    ];

    it('paints the whole line with a continuous gradient', () => {
        const gradient = 'gradient:hex:dbbb6f,hex:c4808a,hex:9070d0,hex:b8cad4,hex:4a8a5e';
        const line = renderLine(widgets, { overrideForegroundColor: gradient });
        const codes = line.match(TRUECOLOR_CODE) ?? [];
        expect(codes.length).toBe(getVisibleWidth(line));
        expect(new Set(codes).size).toBeGreaterThanOrEqual(2);
    });

    it('leaves visible width unchanged versus the non-gradient render', () => {
        const plain = renderLine(widgets);
        const gradient = renderLine(widgets, { overrideForegroundColor: 'gradient:hex:dbbb6f,hex:4a8a5e' });
        expect(getVisibleWidth(gradient)).toBe(getVisibleWidth(plain));
    });

    it('closes with a reset even when the line is truncated (no color leak)', () => {
        // Regression: the gradient pass must run AFTER truncation. If it runs before,
        // truncateStyledText cuts from the right and slices off the trailing \x1b[39m,
        // so the last color leaks past the status line. A narrow width forces
        // truncation; the rendered line must still end with the reset.
        const gradient = 'gradient:hex:dbbb6f,hex:c4808a,hex:9070d0,hex:b8cad4,hex:4a8a5e';
        const full = renderLine(widgets, { overrideForegroundColor: gradient });
        const truncated = renderLine(widgets, { overrideForegroundColor: gradient }, 8);

        // truncation actually happened
        expect(getVisibleWidth(truncated)).toBeLessThan(getVisibleWidth(full));
        // and the gradient's trailing reset survived
        expect(truncated.endsWith('\x1b[39m')).toBe(true);
    });
});
