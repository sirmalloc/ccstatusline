import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { makeUsageProgressBar } from '../../utils/usage';
import { ContextBarWidget } from '../ContextBar';

const GREEN_TRUECOLOR = '\x1b[38;2;0;200;80m';

const context: RenderContext = {
    data: {
        context_window: {
            context_window_size: 200000,
            current_usage: {
                input_tokens: 90000,
                output_tokens: 10000,
                cache_creation_input_tokens: 5000,
                cache_read_input_tokens: 5000
            }
        }
    }
};
const plainBar: WidgetItem = { id: 'ctx', type: 'context-bar' };
const gradientBar: WidgetItem = { ...plainBar, metadata: { gradient: 'traffic' } };
const truecolor: Settings = { ...DEFAULT_SETTINGS, colorLevel: 3 };

describe('ContextBarWidget gradient', () => {
    const widget = new ContextBarWidget();

    it('cycles through the presets with (g), then back to off', () => {
        expect(widget.getCustomKeybinds().some(keybind => keybind.key === 'g' && keybind.action === 'cycle-gradient')).toBe(true);

        const seen: string[] = [];
        let item: WidgetItem = plainBar;
        for (let press = 0; press < 7; press++) {
            item = widget.handleEditorAction('cycle-gradient', item) ?? item;
            seen.push(item.metadata?.gradient ?? 'off');
        }
        expect(seen).toEqual(['traffic', 'thermal', 'viridis', 'cividis', 'blue-orange', 'mono', 'off']);
        expect(item.metadata?.gradient).toBeUndefined();
    });

    it('names the preset in the line editor', () => {
        const thermal = { ...plainBar, metadata: { gradient: 'thermal' } };
        expect(widget.getEditorDisplay(thermal).modifierText).toContain('gradient: thermal');
        expect(widget.getEditorDisplay(plainBar).modifierText ?? '').not.toContain('gradient');
    });

    it('renders the chosen preset', () => {
        const traffic = widget.render(gradientBar, context, truecolor);
        const thermal = widget.render({ ...plainBar, metadata: { gradient: 'thermal' } }, context, truecolor);
        expect(thermal).not.toBe(traffic);
        expect(stripAnsi(thermal ?? '')).toBe(stripAnsi(traffic ?? ''));
    });

    it('reads an earlier on/off setting as the traffic preset', () => {
        const legacy = { ...plainBar, metadata: { gradient: 'true' } };
        expect(widget.render(legacy, context, truecolor)).toBe(widget.render({ ...plainBar, metadata: { gradient: 'traffic' } }, context, truecolor));
        expect(widget.handleEditorAction('cycle-gradient', legacy)?.metadata?.gradient).toBe('thermal');
    });

    it('is off by default and renders exactly as before', () => {
        expect(widget.render(plainBar, context, truecolor)).toBe(`Context: ${makeUsageProgressBar(50, 16)} 100k/200k (50%)`);
    });

    it('colors only the bar, leaving the text unchanged', () => {
        const painted = widget.render(gradientBar, context, truecolor) ?? '';
        expect(painted).toContain(GREEN_TRUECOLOR);
        expect(stripAnsi(painted)).toBe(widget.render(plainBar, context, truecolor));
        // Text after the bar returns to the widget's own color
        expect(painted).toMatch(/\x1b\[39m\] 100k\/200k \(50%\)$/);
    });

    it('colors the bar in every bar style', () => {
        for (const display of ['progress', 'slider', 'slider-only']) {
            const item = { ...gradientBar, metadata: { ...gradientBar.metadata, display } };
            expect(widget.render(item, context, truecolor)).toContain(GREEN_TRUECOLOR);
        }
    });

    it('shows the gradient in the TUI preview too', () => {
        expect(widget.render(gradientBar, { isPreview: true }, truecolor)).toContain(GREEN_TRUECOLOR);
    });

    it('needs truecolor, staying plain at 256 and 16 colors', () => {
        for (const colorLevel of [1, 2] as const) {
            const settings = { ...truecolor, colorLevel };
            expect(widget.render(gradientBar, context, settings)).toBe(widget.render(plainBar, context, settings));
        }
    });

    it('stays plain with colors off or a global foreground override', () => {
        expect(widget.render(gradientBar, context, { ...truecolor, colorLevel: 0 })).not.toContain('\x1b[');
        expect(widget.render(gradientBar, context, { ...truecolor, overrideForegroundColor: 'white' })).not.toContain('\x1b[');
    });
});
