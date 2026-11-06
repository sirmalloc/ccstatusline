import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../utils/renderer';
import { ModelWidget } from '../Model';

const ITEM: WidgetItem = { id: 'model', type: 'model' };
const RAW_ITEM: WidgetItem = { id: 'model', type: 'model', rawValue: true };

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

describe('ModelWidget', () => {
    describe('render()', () => {
        it('strips parenthetical suffix from display_name', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6[1m]', display_name: 'Opus 4.6 (1M context)' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Opus 4.6');
        });

        it('strips parenthetical from Sonnet display_name', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6 (200K context)' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Sonnet 4.6');
        });

        it.each([
            ['Opus 4.6 (beta) (1M context)', 'Opus 4.6'],
            ['Opus 4.6\t(1M context)', 'Opus 4.6'],
            ['Opus 4.6 (beta) preview', 'Opus 4.6 (beta) preview'],
            ['Opus 4.6 (1M context', 'Opus 4.6 (1M context']
        ])('strips only a trailing parenthetical, from its first "(": %j', (displayName, expected) => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6', display_name: displayName } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe(expected);
        });

        it('leaves name unchanged when no parenthetical', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Sonnet 4.6');
        });

        it('handles model as string (legacy)', () => {
            const ctx = makeContext({ data: { model: 'Claude Opus 4.6 (1M context)' } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Claude Opus 4.6');
        });

        it('includes Model: prefix when rawValue is false', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6[1m]', display_name: 'Opus 4.6 (1M context)' } } });
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('Model: Opus 4.6');
        });

        it('returns null when model is absent', () => {
            const ctx = makeContext({ data: {} });
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when context.data is absent', () => {
            const ctx = makeContext();
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns preview text in preview mode', () => {
            const ctx = makeContext({ isPreview: true });
            expect(new ModelWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('Model: Claude');
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('Claude');
        });

        it('uses the label override in place of the default label', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' } } });
            expect(new ModelWidget().render({ ...ITEM, metadata: { label: 'M ' } }, ctx, DEFAULT_SETTINGS)).toBe('M Opus 4.6');
        });

        it('falls back to model id when display_name is absent', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-4-6[1m]' } } });
            expect(new ModelWidget().render(RAW_ITEM, ctx, DEFAULT_SETTINGS)).toBe('claude-opus-4-6[1m]');
        });
    });

    describe('family colors', () => {
        // At the default 256 Color level, hex colors map to the nearest
        // palette entry: #ff8800 is 208 and #0000ff is 21
        const ORANGE = '\x1b[38;5;208m';
        const BLUE = '\x1b[38;5;21m';
        const FG_RESET = '\x1b[39m';
        // Custom colors, so the escape codes don't depend on the terminal's
        // color support (named colors go through chalk)
        const familyItem: WidgetItem = {
            id: 'model',
            type: 'model',
            color: 'hex:112233',
            metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800', 'familyColor.sonnet': 'hex:0000ff' }
        };

        it('colors only the name by the model\'s family, leaving the label to the renderer', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' } } });

            expect(new ModelWidget().render(familyItem, ctx, DEFAULT_SETTINGS)).toBe(`Model: ${ORANGE}Opus 5.5${FG_RESET}`);
        });

        it('leaves a model of no known family to the renderer\'s color', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-3-x', display_name: 'Claude X' } } });

            expect(new ModelWidget().render(familyItem, ctx, DEFAULT_SETTINGS)).toBe('Model: Claude X');
        });

        it('finds the family in the model id when the display name doesn\'t name it', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-6', display_name: 'Claude' } } });

            expect(new ModelWidget().render({ ...familyItem, rawValue: true }, ctx, DEFAULT_SETTINGS)).toBe(`${BLUE}Claude${FG_RESET}`);
        });

        it('renders plain text when colors are off for the whole status line', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' } } });

            expect(new ModelWidget().render(familyItem, ctx, { ...DEFAULT_SETTINGS, colorLevel: 0 })).toBe('Model: Opus 5.5');
        });

        it('previews as Opus in its family color while family colors are on', () => {
            const widget = new ModelWidget();

            expect(widget.render(familyItem, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe(`Model: ${ORANGE}Opus${FG_RESET}`);
            expect(widget.render(ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('Model: Claude');
        });

        it('opens the family colors editor with f and names the option on the editor row', () => {
            const widget = new ModelWidget();

            expect(widget.getCustomKeybinds()).toEqual([{ key: 'f', label: '(f)amily colors', action: 'edit-family-colors' }]);
            expect(widget.getEditorDisplay(familyItem).modifierText).toBe('(family colors)');
            expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
            expect(widget.renderEditor({ widget: ITEM, onComplete: () => undefined, onCancel: () => undefined })).toBeTruthy();
        });

        it('asks the renderer to color around its family run only while family colors are on', () => {
            const widget = new ModelWidget();

            expect(widget.colorsOnlyItsRuns(familyItem)).toBe(true);
            expect(widget.colorsOnlyItsRuns(ITEM)).toBe(false);
        });
    });

    // The renderer colors everything but the family run, the way it colors any widget
    describe('family colors on the status line', () => {
        const ORANGE = '\x1b[38;2;255;136;0m';
        const FG_RESET = '\x1b[39m';
        const familyColored: WidgetItem = { id: 'model', type: 'model', metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800' } };
        const opus = { id: 'claude-opus-4-6', display_name: 'Opus 4.6' };

        function renderLine(item: WidgetItem, settings: Partial<Settings>, model: { id: string; display_name: string } = opus): string {
            const fullSettings: Settings = { ...DEFAULT_SETTINGS, defaultPadding: '', ...settings };
            const context: RenderContext = { isPreview: false, terminalWidth: 0, data: { model } };
            const preRenderedLines = preRenderAllWidgets([[item]], fullSettings, context);
            const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, fullSettings);
            return renderStatusLine([item], fullSettings, context, preRenderedLines[0] ?? [], maxWidths);
        }

        const nord: Partial<Settings> = {
            colorLevel: 2,
            powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, theme: 'nord' }
        };
        // nord's first segment at 256 colors: text 16 on background 73, with
        // the family's #ff8800 as palette entry 208
        const themeText = '\x1b[38;5;16m';
        const ORANGE_256 = '\x1b[38;5;208m';

        it('draws the label in the Powerline theme\'s text color', () => {
            expect(renderLine(familyColored, nord)).toBe(`${themeText}\x1b[48;5;73mModel: ${ORANGE_256}Opus 4.6${themeText}\x1b[49m${FG_RESET}`);
        });

        it('draws a model of no known family in the Powerline theme\'s text color', () => {
            expect(renderLine(familyColored, nord, { id: 'claude-3-x', display_name: 'Claude X' }))
                .toBe(`${themeText}\x1b[48;5;73mModel: Claude X\x1b[49m${FG_RESET}`);
        });

        it('draws the label in the item color', () => {
            const BASE = '\x1b[38;2;17;34;51m';

            expect(renderLine({ ...familyColored, color: 'hex:112233' }, { colorLevel: 3 }))
                .toBe(`${BASE}Model: ${ORANGE}Opus 4.6${BASE}${FG_RESET}`);
        });

        it('leaves the label in the terminal\'s color when the item color is "Default"', () => {
            expect(renderLine({ ...familyColored, color: '' }, { colorLevel: 3 })).toBe(`Model: ${ORANGE}Opus 4.6${FG_RESET}`);
        });

        it('sweeps an item gradient across the label and keeps the family color', () => {
            const line = renderLine({ ...familyColored, color: 'gradient:atlas' }, { colorLevel: 3 });

            // atlas runs #feac5e to #4bc0c8 across "Model:", the text it colors
            expect(line.startsWith('\x1b[38;2;254;172;94mM')).toBe(true);
            expect(line).toContain(`\x1b[38;2;75;192;200m: ${ORANGE}Opus 4.6${FG_RESET}`);
        });

        it('gives way to a global foreground override', () => {
            expect(renderLine(familyColored, { colorLevel: 3, overrideForegroundColor: 'hex:AABBCC' }))
                .toBe(`\x1b[38;2;170;187;204mModel: Opus 4.6${FG_RESET}`);
        });

        it('colors nothing at the No Color level', () => {
            expect(renderLine(familyColored, { colorLevel: 0 })).toBe('Model: Opus 4.6');
        });
    });
});
