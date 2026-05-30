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
    gradientCodeAt,
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

    function renderLine(widgets: WidgetItem[], settingsOverrides: Partial<Settings> = {}): string {
        const settings = createSettings(settingsOverrides);
        const context: RenderContext = { isPreview: false, terminalWidth: 200 };
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
});
