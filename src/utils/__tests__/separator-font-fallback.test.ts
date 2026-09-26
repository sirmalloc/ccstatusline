import {
    afterEach,
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
    containsPowerlineGlyph,
    fontSafeSeparator,
    resetPowerlineFontCache
} from '../powerline';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const fontAbsent = { installed: false, checkedSymbol: '' };
const fontPresent = { installed: true, checkedSymbol: '' };

function renderLine(settings: Settings, widgets: WidgetItem[]): string {
    const context: RenderContext = { isPreview: false };
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    return renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], preCalculatedMaxWidths);
}

describe('font-safe separator fallback', () => {
    afterEach(() => {
        resetPowerlineFontCache();
        delete process.env.DEBUG_FONT_INSTALL;
    });

    it('keeps plain separators untouched regardless of fonts', () => {
        expect(fontSafeSeparator('|', fontAbsent)).toBe('|');
        expect(fontSafeSeparator(' | ', fontAbsent)).toBe(' | ');
        expect(fontSafeSeparator('', fontAbsent)).toBe('');
    });

    it('degrades powerline glyphs to | when no font is detected', () => {
        expect(fontSafeSeparator('', fontAbsent)).toBe('|');
        expect(fontSafeSeparator('', fontAbsent)).toBe('|');
        expect(fontSafeSeparator('\u{F1000}', fontAbsent)).toBe('|'); // astral Nerd Font range
    });

    it('keeps glyphs when a powerline font is detected', () => {
        expect(fontSafeSeparator('', fontPresent)).toBe('');
    });

    it('detects glyphs across PUA and astral ranges', () => {
        expect(containsPowerlineGlyph('')).toBe(true);
        expect(containsPowerlineGlyph('/')).toBe(false);
        expect(containsPowerlineGlyph('\u{F1000}')).toBe(true);
    });

    it('renders | instead of mojibake in powerline mode without fonts', () => {
        process.env.DEBUG_FONT_INSTALL = '1';
        resetPowerlineFontCache();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            defaultPadding: '',
            powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true }
        };
        const widgets: WidgetItem[] = [
            { id: '1', type: 'custom-text', customText: 'A' },
            { id: '2', type: 'custom-text', customText: 'B' }
        ];

        const line = renderLine(settings, widgets);

        expect(line).toContain('|');
        expect(line).not.toContain('');
    });

    it('falls back for regular-mode separators typed as PUA glyphs', () => {
        process.env.DEBUG_FONT_INSTALL = '1';
        resetPowerlineFontCache();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            defaultPadding: ''
        };
        const widgets: WidgetItem[] = [
            { id: '1', type: 'custom-text', customText: 'A' },
            { id: '2', type: 'separator', character: '' },
            { id: '3', type: 'custom-text', customText: 'B' }
        ];

        const line = renderLine(settings, widgets);

        expect(line).toContain('|');
        expect(line).not.toContain('');
    });
});
