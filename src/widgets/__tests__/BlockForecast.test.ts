import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { BlockForecastWidget } from '../BlockForecast';

const ITEM: WidgetItem = { id: 'forecast', type: 'block-forecast' };
const REMAINING: WidgetItem = { ...ITEM, metadata: { invert: 'true' } };

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new BlockForecastWidget().render(item, context, DEFAULT_SETTINGS);
}

function live(sessionUsage: number, projectedPercent: number, limitInMs: number | null = null): RenderContext {
    return { usageData: { sessionUsage }, sessionForecast: { projectedPercent, limitInMs } };
}

describe('BlockForecastWidget', () => {
    it('shows the projected usage at reset', () => {
        expect(render(ITEM, live(42, 83.2))).toBe('→83.2%');
    });

    it('shows 100% when usage is on pace for the limit', () => {
        expect(render(ITEM, live(61, 100, 4_387_500))).toBe('→100.0%');
    });

    it('shows the projected remaining percent in remaining mode', () => {
        expect(render(REMAINING, live(42, 83.2))).toBe('→16.8%');
        expect(render(REMAINING, live(61, 100, 4_387_500))).toBe('→0.0%');
    });

    it('drops the label in raw value mode', () => {
        expect(render({ ...ITEM, rawValue: true }, live(42, 83.2))).toBe('83.2%');
    });

    it('uses the widget\'s number format', () => {
        expect(render({ ...ITEM, numberFormat: { style: 'whole' } }, live(42, 83.2))).toBe('→83%');
    });

    it.each([
        ['there is no forecast', { usageData: { sessionUsage: 42 } }],
        ['nothing is known', {}],
        ['session usage is unknown', { sessionForecast: { projectedPercent: 83.2, limitInMs: null } }],
        ['the projection reads the same as current usage', live(42, 42.04)]
    ])('renders nothing when %s', (_label, context: RenderContext) => {
        expect(render(ITEM, context)).toBeNull();
    });

    it('compares in the widget\'s number format', () => {
        expect(render({ ...ITEM, numberFormat: { style: 'whole' } }, live(42, 42.4))).toBeNull();
    });

    // On pace for the limit, so it reads with Block Limit Timer's preview
    it('shows a sample in the preview', () => {
        expect(render(ITEM, { isPreview: true })).toBe('→100.0%');
        expect(render(REMAINING, { isPreview: true })).toBe('→0.0%');
    });

    it('describes itself for the line editor', () => {
        const widget = new BlockForecastWidget();

        expect(widget.getDisplayName()).toBe('Block Forecast');
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getDefaultColor()).toBe('brightBlue');
        expect(widget.getEditorDisplay(ITEM).modifierText).toBe('(used)');
        expect(widget.getEditorDisplay(REMAINING).modifierText).toBe('(remaining)');
    });

    it('toggles remaining mode with u', () => {
        const widget = new BlockForecastWidget();

        expect(widget.getCustomKeybinds(ITEM)).toEqual([{ key: 'u', label: '(u) show remaining', action: 'toggle-invert' }]);
        expect(widget.getCustomKeybinds(REMAINING)).toEqual([{ key: 'u', label: '(u) show used', action: 'toggle-invert' }]);
        expect(widget.handleEditorAction('toggle-invert', ITEM)?.metadata?.invert).toBe('true');
        expect(widget.handleEditorAction('toggle-progress', ITEM)).toBeNull();
    });
});
