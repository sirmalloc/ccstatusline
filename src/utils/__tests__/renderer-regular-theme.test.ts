import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    SettingsSchema,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    getColorAnsiCode,
    updateColorMap
} from '../colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

// Dracula level-3 segment palette (POWERLINE_THEMES['dracula'][3].bg) — the
// array regular mode cycles as foregrounds.
const fg = (color: string, level: 'ansi16' | 'ansi256' | 'truecolor' = 'truecolor'): string => getColorAnsiCode(color, level, false);

function themedSettings(theme?: string, colorLevel: 1 | 2 | 3 = 3): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel,
        defaultPadding: '',
        theme
    };
}

function renderWidgets(settings: Settings, widgets: WidgetItem[]): string {
    const context: RenderContext = { isPreview: false, data: { session_id: 'test-session' } };
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    return renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], preCalculatedMaxWidths);
}

describe('renderer regular-mode theme', () => {
    const originalLevel = chalk.level;

    // Named colors resolve through COLOR_MAP, which captures chalk's level at
    // build time — pin it so assertions see real escape codes.
    beforeEach(() => {
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = originalLevel;
        updateColorMap();
    });

    it('cycles the theme palette across uncolored widgets', () => {
        const line = renderWidgets(themedSettings('dracula'), [
            { id: '1', type: 'custom-text', customText: 'A' },
            { id: '2', type: 'custom-text', customText: 'B' },
            { id: '3', type: 'custom-text', customText: 'C' }
        ]);

        expect(line).toContain(fg('hex:BD93F9'));
        expect(line).toContain(fg('hex:F8F8F2'));
        expect(line).toContain(fg('hex:FF5555'));
        expect(line).not.toContain(fg('hex:8BE9FD')); // 3 widgets, palette has 5
    });

    it('keeps explicit widget colors over the theme but keeps the palette rhythm', () => {
        const line = renderWidgets(themedSettings('dracula'), [
            { id: '1', type: 'custom-text', customText: 'A', color: 'red' },
            { id: '2', type: 'custom-text', customText: 'B' }
        ]);

        expect(line).toContain(fg('hex:CC0000')); // explicit 'red' wins
        expect(line).not.toContain(fg('hex:BD93F9')); // slot 0 still consumed
        expect(line).toContain(fg('hex:F8F8F2')); // second widget gets slot 1
    });

    it('does not theme separators and they consume no palette slot', () => {
        const line = renderWidgets(themedSettings('dracula'), [
            { id: '1', type: 'custom-text', customText: 'A' },
            { id: '2', type: 'separator', character: ' | ' },
            { id: '3', type: 'custom-text', customText: 'B' }
        ]);

        expect(line).toContain(fg('hex:BD93F9'));
        expect(line).toContain(fg('hex:F8F8F2')); // consecutive slots across the separator
        expect(line).not.toContain(fg('hex:FF5555'));
    });

    it('does not theme widgets that preserve their own colors', () => {
        const line = renderWidgets(themedSettings('dracula'), [
            { id: '1', type: 'custom-command', commandPath: 'echo kept', preserveColors: true },
            { id: '2', type: 'custom-text', customText: 'B' }
        ]);

        expect(line).not.toContain(fg('hex:BD93F9'));
        expect(line).toContain(fg('hex:F8F8F2')); // preserved widget still advanced the palette
    });

    it('shares one palette slot across merged widgets', () => {
        const line = renderWidgets(themedSettings('dracula'), [
            { id: '1', type: 'custom-text', customText: 'A', merge: true },
            { id: '2', type: 'custom-text', customText: 'B' }
        ]);

        expect(line).toContain(fg('hex:BD93F9'));
        expect(line).not.toContain(fg('hex:F8F8F2')); // both merged widgets share slot 0
    });

    it('leaves default colors when theme is absent, custom, or unknown', () => {
        const widgets: WidgetItem[] = [{ id: '1', type: 'custom-text', customText: 'A' }];

        for (const theme of [undefined, 'custom', 'not-a-theme']) {
            const line = renderWidgets(themedSettings(theme), widgets);
            expect(line).not.toContain(fg('hex:BD93F9'));
        }
    });

    it('uses the theme level matching colorLevel', () => {
        const level2 = renderWidgets(themedSettings('dracula', 2), [
            { id: '1', type: 'custom-text', customText: 'A' }
        ]);

        expect(level2).toContain(fg('ansi256:141', 'ansi256'));
        expect(level2).not.toContain(fg('hex:BD93F9'));

        // ansi16-level palettes carry bg*-prefixed names; they must render as
        // foregrounds, not backgrounds
        const level1 = renderWidgets(themedSettings('nord', 1), [
            { id: '1', type: 'custom-text', customText: 'A' }
        ]);

        expect(level1).toContain(fg('brightCyan', 'ansi16'));
        expect(level1).not.toContain(getColorAnsiCode('bgBrightCyan', 'ansi16', true));
    });

    it('parses the theme key without a version bump', () => {
        expect(SettingsSchema.parse({ theme: 'dracula' }).theme).toBe('dracula');
        expect(SettingsSchema.parse({}).theme).toBeUndefined();
    });
});
