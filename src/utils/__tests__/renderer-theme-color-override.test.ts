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
    getColorAnsiCode,
    getPowerlineTheme
} from '../colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const THEME = 'nord-aurora';

// nord-aurora truecolor palette, read from source of truth so tests don't hardcode hex.
const themeColors = getPowerlineTheme(THEME)?.[3];
const themeFg = themeColors?.fg ?? [];

function createSettings(): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel: 3,
        defaultPadding: '',
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            enabled: true,
            theme: THEME
        }
    };
}

function renderThemed(widgets: WidgetItem[]): string {
    const settings = createSettings();
    const context: RenderContext = {
        isPreview: false,
        lineIndex: 0,
        globalPowerlineThemeIndex: 0
    };
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    const preRenderedWidgets = preRenderedLines[0] ?? [];

    return renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
}

describe('renderer per-widget theme color overrides', () => {
    // Distinctive hex specs that resolve to real truecolor codes and are not part of
    // the nord-aurora palette (named colours resolve to '' at truecolor, so avoid them).
    const FG = 'hex:FF0000';
    const BG = 'hex:0000FF';

    it('ignores an unpinned widget colour under a theme (no change on upgrade)', () => {
        // The load-bearing guarantee: a colour persisted before a theme was enabled
        // stays dormant. This assertion is theme-hex independent.
        const line = renderThemed([{ id: 'w1', type: 'custom-text', customText: 'x', color: FG }]);
        expect(line).not.toContain(getColorAnsiCode(FG, 'truecolor', false));
        // ...and the theme's own foreground is what applies instead.
        expect(line).toContain(getColorAnsiCode(themeFg[0] ?? '', 'truecolor', false));
    });

    it('applies a pinned widget foreground over the theme', () => {
        const line = renderThemed([{ id: 'w1', type: 'custom-text', customText: 'x', color: FG, pinColor: true }]);
        expect(line).toContain(getColorAnsiCode(FG, 'truecolor', false));
        expect(line).not.toContain(getColorAnsiCode(themeFg[0] ?? '', 'truecolor', false));
    });

    it('pins background independently of foreground', () => {
        const line = renderThemed([{
            id: 'w1', type: 'custom-text', customText: 'x',
            color: FG, backgroundColor: BG, pinBackgroundColor: true
        }]);
        expect(line).toContain(getColorAnsiCode(BG, 'truecolor', true)); // bg overridden
        expect(line).not.toContain(getColorAnsiCode(FG, 'truecolor', false)); // fg still themed
    });

    it('keeps sibling theme colours stable when one widget is pinned', () => {
        // w2 is the 2nd themed widget, so it must use theme fg index 1. That only
        // holds if the pinned w1 still advanced the theme colour cycle.
        const line = renderThemed([
            { id: 'w1', type: 'custom-text', customText: 'a', color: 'red', pinColor: true },
            { id: 'w2', type: 'custom-text', customText: 'b' }
        ]);
        expect(line).toContain(getColorAnsiCode(themeFg[1] ?? '', 'truecolor', false));
        expect(line).not.toContain(getColorAnsiCode(themeFg[0] ?? '', 'truecolor', false));
    });
});
