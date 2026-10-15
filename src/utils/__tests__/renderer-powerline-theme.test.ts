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
import { getColorAnsiCode } from '../colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

function createSettings(continueThemeAcrossLines: boolean, lineThemes?: (string | undefined)[]): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel: 3,
        defaultPadding: '',
        lineThemes,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            enabled: true,
            theme: 'nord-aurora',
            continueThemeAcrossLines
        }
    };
}

function renderLine(settings: Settings, globalPowerlineThemeIndex: number): string {
    const widgets: WidgetItem[] = [{
        id: 'w1',
        type: 'custom-text',
        customText: 'tail'
    }];
    const context: RenderContext = {
        isPreview: false,
        lineIndex: 1,
        globalPowerlineThemeIndex
    };
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    const preRenderedWidgets = preRenderedLines[0] ?? [];

    return renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
}

describe('renderer powerline theme carry-over', () => {
    it('continues theme colors across lines when enabled', () => {
        const line = renderLine(createSettings(true), 2);

        expect(line).toContain(getColorAnsiCode('hex:5E81AC', 'truecolor', true));
        expect(line).not.toContain(getColorAnsiCode('hex:BF616A', 'truecolor', true));
    });

    it('restarts theme colors on each line when disabled', () => {
        const line = renderLine(createSettings(false), 2);

        expect(line).toContain(getColorAnsiCode('hex:BF616A', 'truecolor', true));
    });

    describe('per-line themes (lineThemes)', () => {
        it('overrides the global theme and restarts at slot 0 despite a carried offset', () => {
            const line = renderLine(createSettings(true, [undefined, 'dracula']), 2);

            expect(line).toContain(getColorAnsiCode('hex:BD93F9', 'truecolor', true));
            expect(line).not.toContain(getColorAnsiCode('hex:5E81AC', 'truecolor', true));
        });

        it('\'none\' renders the line unthemed', () => {
            const line = renderLine(createSettings(true, [undefined, 'none']), 2);

            expect(line).not.toContain(getColorAnsiCode('hex:BF616A', 'truecolor', true));
            expect(line).not.toContain(getColorAnsiCode('hex:5E81AC', 'truecolor', true));
        });

        it('applies the per-line theme when continuation is disabled', () => {
            const line = renderLine(createSettings(false, [undefined, 'dracula']), 2);

            expect(line).toContain(getColorAnsiCode('hex:BD93F9', 'truecolor', true));
        });
    });
});
