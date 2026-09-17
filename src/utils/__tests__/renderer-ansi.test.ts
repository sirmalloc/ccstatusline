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
    getVisibleWidth,
    stripOscCodes,
    truncateStyledText
} from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const OSC8_OPEN = '\x1b]8;;https://example.com/docs\x1b\\';
const OSC8_CLOSE = '\x1b]8;;\x1b\\';
const OSC8_OPEN_WITH_PARAMS = '\x1b]8;id=abc;https://example.com/docs\x1b\\';
const OSC8_CLOSE_WITH_PARAMS = '\x1b]8;id=abc;\x1b\\';
const BEL_OSC8_OPEN = '\x1b]8;;https://example.com/docs\x07';
const BEL_OSC8_CLOSE = '\x1b]8;;\x07';

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

    return renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths[0] ?? []);
}

describe('renderer ANSI/OSC handling', () => {
    it('treats OSC 8 wrappers as non-visible text for width calculations', () => {
        const text = `A ${OSC8_OPEN}click${OSC8_CLOSE} B`;
        expect(getVisibleText(text)).toBe('A click B');
        expect(getVisibleWidth(text)).toBe(getVisibleWidth('A click B'));
    });

    it('strips OSC controls while preserving SGR styling', () => {
        const text = `\x1b[31m${OSC8_OPEN}click${OSC8_CLOSE}\x1b[39m`;
        expect(stripOscCodes(text)).toBe('\x1b[31mclick\x1b[39m');
    });

    it('treats text-presentation pictographs as narrow unless explicitly emoji-style', () => {
        expect(getVisibleWidth('⚠ 2')).toBe(3);
        expect(getVisibleWidth('⚠️ 2')).toBe(4);
        expect(getVisibleWidth('😀 2')).toBe(4);
    });

    it('closes open OSC 8 hyperlinks when truncating styled text', () => {
        const text = `${OSC8_OPEN}very-long-link-text${OSC8_CLOSE}`;
        const truncated = truncateStyledText(text, 10, { ellipsis: true });

        expect(truncated.endsWith('...')).toBe(true);
        expect(truncated).toContain(OSC8_CLOSE);
        expect(getVisibleWidth(truncated)).toBeLessThanOrEqual(10);
    });

    it('keeps OSC 8 links well-formed in normal renderer truncation', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: `${OSC8_OPEN}very-long-link-text${OSC8_CLOSE}`
            }
        ];

        const line = renderLine(widgets, { terminalWidth: 12 });
        expect(line.endsWith('...')).toBe(true);
        expect(line).toContain(OSC8_CLOSE);
        expect(getVisibleWidth(line)).toBeLessThanOrEqual(12);
    });

    it('keeps OSC 8 links well-formed in powerline truncation', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'w1',
                type: 'custom-text',
                customText: `${OSC8_OPEN}very-long-link-text${OSC8_CLOSE}`,
                color: 'white',
                backgroundColor: 'bgBlue'
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
            terminalWidth: 16,
            settings: {
                powerline: {
                    ...DEFAULT_SETTINGS.powerline,
                    enabled: true,
                    separators: ['\uE0B0'],
                    separatorInvertBackground: [false]
                }
            }
        });

        expect(line).toContain(OSC8_CLOSE);
        expect(getVisibleWidth(line)).toBeLessThanOrEqual(16);
    });

    it('truncates custom-command preserveColors output without breaking OSC 8', () => {
        const widget: WidgetItem = {
            id: 'cmd1',
            type: 'custom-command',
            preserveColors: true,
            maxWidth: 6
        };
        const settings = createSettings();
        const context: RenderContext = {
            isPreview: false,
            terminalWidth: 200
        };
        const content = `${OSC8_OPEN}abcdefghij${OSC8_CLOSE}`;
        const preRenderedWidgets = [{
            content,
            plainLength: getVisibleWidth(content),
            widget
        }];

        const line = renderStatusLine([widget], settings, context, preRenderedWidgets, []);
        expect(line).toContain(OSC8_CLOSE);
        expect(getVisibleWidth(line)).toBe(6);
    });

    it('uses visible width for flex separator alignment when OSC 8 text is present', () => {
        const widgets: WidgetItem[] = [
            {
                id: 'left',
                type: 'custom-text',
                customText: `${OSC8_OPEN}A${OSC8_CLOSE}`
            },
            {
                id: 'flex',
                type: 'flex-separator'
            },
            {
                id: 'right',
                type: 'custom-text',
                customText: 'B'
            }
        ];

        const line = renderLine(widgets, { terminalWidth: 26 });
        const visible = getVisibleText(line);

        expect(visible.startsWith('A')).toBe(true);
        expect(visible.endsWith('B')).toBe(true);
        expect(visible.includes('...')).toBe(false);
        expect(getVisibleWidth(line)).toBe(20);
    });

    it('handles BEL-terminated OSC 8 sequences during truncation', () => {
        const line = `${BEL_OSC8_OPEN}bel-link-text${BEL_OSC8_CLOSE}`;
        const truncated = truncateStyledText(line, 8, { ellipsis: true });

        expect(truncated.endsWith('...')).toBe(true);
        expect(truncated).toContain(BEL_OSC8_CLOSE);
        expect(getVisibleWidth(truncated)).toBeLessThanOrEqual(8);
    });

    it('handles OSC 8 sequences with params during truncation', () => {
        const line = `${OSC8_OPEN_WITH_PARAMS}param-link-text${OSC8_CLOSE_WITH_PARAMS}`;
        const truncated = truncateStyledText(line, 8, { ellipsis: true });

        expect(truncated.endsWith('...')).toBe(true);
        expect(truncated).toContain(OSC8_CLOSE);
        expect(getVisibleWidth(truncated)).toBeLessThanOrEqual(8);
    });
});

describe('renderer minimalist mode', () => {
    it('renders widget as raw value when minimalist mode is enabled', () => {
        const widgets: WidgetItem[] = [{ id: 'model1', type: 'model' }];
        const settings = createSettings();
        const context: RenderContext = {
            isPreview: true,
            minimalist: true
        };

        const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
        const content = preRenderedLines[0]?.[0]?.content;

        // With minimalist mode, model widget should render raw value ('Claude') not 'Model: Claude'
        expect(content).toBe('Claude');
    });

    it('renders widget with label when minimalist mode is disabled', () => {
        const widgets: WidgetItem[] = [{ id: 'model1', type: 'model' }];
        const settings = createSettings();
        const context: RenderContext = {
            isPreview: true,
            minimalist: false
        };

        const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
        const content = preRenderedLines[0]?.[0]?.content;

        expect(content).toBe('Model: Claude');
    });
});
