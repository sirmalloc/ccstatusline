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
    applyColors,
    getColorAnsiCode
} from '../colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const CYAN_256 = '\x1b[38;5;51m';

const context: RenderContext = {
    isPreview: false,
    data: {
        context_window: {
            context_window_size: 200000,
            current_usage: {
                input_tokens: 90000,
                output_tokens: 0,
                cache_creation_input_tokens: 5000,
                cache_read_input_tokens: 5000
            }
        }
    }
};
const gradientBar: WidgetItem = { id: 'ctx', type: 'context-bar', color: 'ansi256:51', metadata: { gradient: 'true' } };

function render(widgets: WidgetItem[], settings: Settings): string {
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    return renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], maxWidths);
}

describe('colors embedded in widget text', () => {
    it('return to the widget\'s color, not the terminal default, after a colored run', () => {
        expect(applyColors('a\x1b[31mb\x1b[39mc', 'ansi256:51', undefined, false, 'ansi256'))
            .toBe(`${CYAN_256}a\x1b[31mb${CYAN_256}c\x1b[39m`);
    });

    it('stay as they are when the widget has no color of its own', () => {
        expect(applyColors('a\x1b[31mb\x1b[39mc', undefined, undefined, false, 'ansi256')).toBe('a\x1b[31mb\x1b[39mc');
    });

    it('keep the text after a gradient bar in the widget\'s color in plain mode', () => {
        const line = render([gradientBar], { ...DEFAULT_SETTINGS, colorLevel: 3, defaultPadding: '' });
        expect(line).toContain(`${CYAN_256}] 100k/200k (50%)`);
    });

    it('keep the text after a gradient bar in the theme\'s color in Powerline mode', () => {
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            defaultPadding: '',
            powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, theme: 'nord-aurora' }
        };
        const line = render([gradientBar], settings);
        const themeForeground = getColorAnsiCode('hex:ECEFF4', 'truecolor');
        expect(line).toContain('\x1b[38;2;0;200;80m');
        expect(line).toContain(`${themeForeground}] 100k/200k (50%)`);
    });
});
