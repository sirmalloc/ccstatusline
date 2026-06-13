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
    getVisibleText,
    getVisibleWidth
} from '../ansi';
import {
    applyColors,
    applyParensDim
} from '../colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const INTENSITY_RESET = '\x1b[22m';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        flexMode: 'full',
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function renderLine(
    widgets: WidgetItem[],
    options: { settings?: Partial<Settings>; terminalWidth?: number } = {}
): string {
    const settings = createSettings(options.settings);
    const context: RenderContext = {
        isPreview: false,
        terminalWidth: options.terminalWidth
    };

    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    const preRenderedWidgets = preRenderedLines[0] ?? [];

    return renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
}

describe('applyColors dim handling', () => {
    it('dims the whole text with a single intensity reset', () => {
        expect(applyColors('ctx', undefined, undefined, false, 'ansi16', true)).toBe(`${DIM}ctx${INTENSITY_RESET}`);
    });

    it('emits one intensity reset when bold and dim are combined', () => {
        expect(applyColors('ctx', undefined, undefined, true, 'ansi16', true)).toBe(`${BOLD}${DIM}ctx${INTENSITY_RESET}`);
    });

    it('dims only parenthesized spans in parens mode', () => {
        expect(applyColors('42k (21%)', undefined, undefined, false, 'ansi16', 'parens')).toBe(`42k ${DIM}(21%)${INTENSITY_RESET}`);
    });

    it('re-asserts bold after each parens span when bold is active', () => {
        expect(applyColors('42k (21%)', undefined, undefined, true, 'ansi16', 'parens')).toBe(`${BOLD}42k ${DIM}(21%)${INTENSITY_RESET}${BOLD}${INTENSITY_RESET}`);
    });

    it('leaves text without parens untouched', () => {
        expect(applyParensDim('plain text')).toBe('plain text');
    });

    it('dims multiple parens spans independently', () => {
        expect(applyParensDim('(a) mid (b)')).toBe(`${DIM}(a)${INTENSITY_RESET} mid ${DIM}(b)${INTENSITY_RESET}`);
    });
});

describe('renderer dim styling', () => {
    it('dims a whole widget in normal mode', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'hello',
                dim: true
            }
        ];

        const line = renderLine(widgets);
        expect(line.indexOf(DIM)).toBeGreaterThanOrEqual(0);
        expect(line.indexOf(DIM)).toBeLessThan(line.indexOf('hello'));
        expect(line.indexOf(INTENSITY_RESET)).toBeGreaterThan(line.indexOf('hello'));
    });

    it('dims only the parens span in normal mode', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'ctx (42%)',
                dim: 'parens'
            }
        ];

        const line = renderLine(widgets);
        expect(line).toContain(`${DIM}(42%)${INTENSITY_RESET}`);
        expect(line.indexOf('ctx')).toBeLessThan(line.indexOf(DIM));
    });

    it('keeps surrounding bold across a parens span', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'ctx (42%)',
                bold: true,
                dim: 'parens'
            }
        ];

        const line = renderLine(widgets);
        expect(line).toContain(`${DIM}(42%)${INTENSITY_RESET}${BOLD}`);
    });

    it('does not change the visible text or width', () => {
        const plain: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'ctx (42%)'
            }
        ];
        const dimmed: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'ctx (42%)',
                bold: true,
                dim: 'parens'
            }
        ];

        const plainLine = renderLine(plain);
        const dimmedLine = renderLine(dimmed);
        expect(getVisibleText(dimmedLine)).toBe(getVisibleText(plainLine));
        expect(getVisibleWidth(dimmedLine)).toBe(getVisibleWidth(plainLine));
    });

    it('applies dim in powerline mode and resets after the separator', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'head',
                color: 'white',
                backgroundColor: 'bgBlue',
                dim: true
            },
            {
                id: 'w2',
                type: 'custom-text',
                customText: 'tail',
                color: 'white',
                backgroundColor: 'bgGreen'
            }
        ];

        const line = renderLine(widgets, {
            settings: {
                powerline: {
                    ...DEFAULT_SETTINGS.powerline,
                    enabled: true,
                    separators: ['\uE0B0'],
                    separatorInvertBackground: [false]
                }
            }
        });

        expect(line.indexOf(DIM)).toBeGreaterThanOrEqual(0);
        expect(line.indexOf(DIM)).toBeLessThan(line.indexOf('head'));
        expect(line.indexOf(INTENSITY_RESET)).toBeGreaterThan(line.indexOf('\uE0B0'));
        expect(line.indexOf(INTENSITY_RESET)).toBeLessThan(line.indexOf('tail'));
    });

    it('dims parens spans in powerline mode', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'ctx (42%)',
                color: 'white',
                backgroundColor: 'bgBlue',
                dim: 'parens'
            }
        ];

        const line = renderLine(widgets, {
            settings: {
                powerline: {
                    ...DEFAULT_SETTINGS.powerline,
                    enabled: true,
                    separators: ['\uE0B0'],
                    separatorInvertBackground: [false]
                }
            }
        });

        expect(line).toContain(`${DIM}(42%)${INTENSITY_RESET}`);
    });
});
