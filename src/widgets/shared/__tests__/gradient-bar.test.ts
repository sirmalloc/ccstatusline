import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import {
    BAR_GRADIENT_PRESETS,
    filterGradientKeybinds,
    noteGradientNeedsTruecolor,
    paintGradientBar,
    type BarGradientPreset
} from '../gradient-bar';

const ESC = '\x1b';
const DEFAULT_FG = `${ESC}[39m`;

// The color codes in a painted bar, in order
function codes(painted: string): string[] {
    return painted.match(/\x1b\[[0-9;]*m/g) ?? [];
}

describe('paintGradientBar', () => {
    it('changes only colors, never the bar itself', () => {
        for (const bar of ['[████░░░░]', '[░░░░]', '[████]', '▓▓▓░░░░░']) {
            expect(stripAnsi(paintGradientBar(bar))).toBe(bar);
        }
    });

    it('runs filled cells from green to red by position, in true RGB', () => {
        const painted = paintGradientBar('[█████]');
        expect(painted.startsWith(`[${ESC}[38;2;0;200;80m█`)).toBe(true);
        expect(painted).toContain(`${ESC}[38;2;220;200;0m█`);
        expect(painted.endsWith(`${ESC}[38;2;220;40;20m█${DEFAULT_FG}]`)).toBe(true);
    });

    it('colors a cell by where it sits in the bar, not by how full the bar is', () => {
        const quarter = codes(paintGradientBar('[██░░░░░░]'));
        const full = codes(paintGradientBar('[████████]'));
        expect(quarter.slice(0, 2)).toEqual(full.slice(0, 2));
    });

    it('paints empty cells dark gray and ends the colored run before the bracket', () => {
        const painted = paintGradientBar('[█░░]');
        expect(painted).toBe(`[${ESC}[38;2;0;200;80m█${ESC}[38;2;60;60;60m░░${DEFAULT_FG}]`);
    });

    it('starts and ends each preset on its own colors', () => {
        const ends = (preset: BarGradientPreset) => {
            const found = codes(paintGradientBar('[████████]', preset));
            return [found[0], found.at(-2)];
        };
        const seen = new Set<string>();
        for (const preset of BAR_GRADIENT_PRESETS) {
            const [first, last] = ends(preset);
            expect(first).not.toBe(last);
            seen.add(`${first}${last}`);
        }
        expect(seen.size).toBe(BAR_GRADIENT_PRESETS.length);
        expect(ends('traffic')).toEqual([`${ESC}[38;2;0;200;80m`, `${ESC}[38;2;220;40;20m`]);
    });

    it('gets brighter from end to end in the colorblind-safe presets', () => {
        const luminance = (code: string | undefined) => {
            const [r = 0, g = 0, b = 0] = (code ?? '').replace(`${ESC}[38;2;`, '').replace('m', '').split(';').map(Number);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        for (const preset of ['viridis', 'cividis', 'mono'] as const) {
            const cells = codes(paintGradientBar('[████████]', preset)).slice(0, -1);
            const values = cells.map(luminance);
            expect(values).toEqual([...values].sort((a, b) => a - b));
        }
    });

    it('colors the slider bar\'s filled cells too', () => {
        const painted = paintGradientBar('▓▓░░');
        expect(painted.startsWith(`${ESC}[38;2;0;200;80m▓`)).toBe(true);
        expect(painted.endsWith(`${ESC}[38;2;60;60;60m░░${DEFAULT_FG}`)).toBe(true);
    });

    it('colors the line bar\'s cells too', () => {
        const painted = paintGradientBar('━━──');
        expect(stripAnsi(painted)).toBe('━━──');
        expect(painted.startsWith(`${ESC}[38;2;0;200;80m━`)).toBe(true);
        expect(painted.endsWith(`${ESC}[38;2;60;60;60m──${DEFAULT_FG}`)).toBe(true);
    });
});

describe('the line editor\'s truecolor rule', () => {
    const gradientKey = { key: 'g', label: '(g)radient', action: 'cycle-gradient' };
    const progressKey = { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' };

    it('hides (g) below truecolor and keeps the other keys', () => {
        expect(filterGradientKeybinds([progressKey, gradientKey], { ...DEFAULT_SETTINGS, colorLevel: 3 })).toEqual([progressKey, gradientKey]);
        expect(filterGradientKeybinds([progressKey, gradientKey], { ...DEFAULT_SETTINGS, colorLevel: 2 })).toEqual([progressKey]);
    });

    it('notes that a saved preset needs truecolor below it', () => {
        const color256 = { ...DEFAULT_SETTINGS, colorLevel: 2 } as const;
        expect(noteGradientNeedsTruecolor('(long bar, gradient: blue-orange)', color256)).toBe('(long bar, gradient: blue-orange, needs truecolor)');
        expect(noteGradientNeedsTruecolor('(long bar, gradient: blue-orange)', { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe('(long bar, gradient: blue-orange)');
        expect(noteGradientNeedsTruecolor('(long bar)', color256)).toBe('(long bar)');
        expect(noteGradientNeedsTruecolor(undefined, color256)).toBeUndefined();
    });
});
