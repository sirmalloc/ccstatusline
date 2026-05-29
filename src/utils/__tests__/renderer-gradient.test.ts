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
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

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

function renderLine(widgets: WidgetItem[], settingsOverrides: Partial<Settings> = {}): string {
    const settings = createSettings(settingsOverrides);
    const context: RenderContext = { isPreview: false, terminalWidth: 200 };
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    return renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], preCalculatedMaxWidths);
}

describe('renderer gradient widget colors', () => {
    it('renders a per-character gradient in the regular path', () => {
        const widgets: WidgetItem[] = [
            { id: 'w1', type: 'custom-text', customText: 'ABCDEF', color: 'gradient:retro' }
        ];

        const line = renderLine(widgets, { colorLevel: 3 });
        const codes = line.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? [];
        // 6 visible characters -> 6 color codes, with several distinct colors
        expect(codes.length).toBeGreaterThanOrEqual(6);
        expect(new Set(codes).size).toBeGreaterThan(1);
    });

    it('degrades to a solid first-stop color in the powerline path', () => {
        const widgets: WidgetItem[] = [
            { id: 'w1', type: 'custom-text', customText: 'ABCDEF', color: 'gradient:retro', backgroundColor: 'bgBlue' }
        ];

        const line = renderLine(widgets, {
            colorLevel: 3,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                separators: [''],
                separatorInvertBackground: [false]
            }
        });

        // first stop of the retro preset is #3f51b1 -> rgb(63,81,177)
        expect(line).toContain('\x1b[38;2;63;81;177m');
        // not a per-character gradient: only one distinct foreground color for the text
        const fgCodes = line.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? [];
        expect(new Set(fgCodes).size).toBe(1);
    });
});
