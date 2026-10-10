import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
// Imported before the widget, as the reset timer tests do: loading a widget first
// enters the usage -> config -> widget registry import cycle midway under Node.
import { formatUsageDuration } from '../../utils/usage';
import { BlockLimitTimerWidget } from '../BlockLimitTimer';

const ITEM: WidgetItem = { id: 'limit', type: 'block-limit-timer' };
const COMPACT: WidgetItem = { ...ITEM, metadata: { compact: 'true' } };

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new BlockLimitTimerWidget().render(item, context, DEFAULT_SETTINGS);
}

function limitIn(limitInMs: number | null): RenderContext {
    return { sessionForecast: { projectedPercent: 100, limitInMs } };
}

describe('BlockLimitTimerWidget', () => {
    it('shows the time until the limit, rounded down to the minute', () => {
        expect(render(ITEM, limitIn(4_387_500))).toBe('Limit in: 1hr 13m');
    });

    it('formats durations like the reset timers', () => {
        expect(render(ITEM, limitIn(4_387_500))).toBe(`Limit in: ${formatUsageDuration(4_387_500)}`);
        expect(render(COMPACT, limitIn(4_387_500))).toBe(`Limit in: ${formatUsageDuration(4_387_500, true)}`);
    });

    it('shows the short form with s', () => {
        expect(render(COMPACT, limitIn(4_387_500))).toBe('Limit in: 1h13m');
    });

    it('drops the label in raw value mode', () => {
        expect(render({ ...ITEM, rawValue: true }, limitIn(4_387_500))).toBe('1hr 13m');
    });

    it('never shows 0m in the last minute', () => {
        expect(render(ITEM, limitIn(30_000))).toBe('Limit in: 1m');
        expect(render(COMPACT, limitIn(30_000))).toBe('Limit in: 1m');
    });

    it.each([
        ['the limit comes after the reset', limitIn(null)],
        ['there is no forecast', {}]
    ])('renders nothing when %s', (_label, context: RenderContext) => {
        expect(render(ITEM, context)).toBeNull();
    });

    it('shows a sample in the preview', () => {
        expect(render(ITEM, { isPreview: true })).toBe('Limit in: 1hr 13m');
        expect(render(COMPACT, { isPreview: true })).toBe('Limit in: 1h13m');
    });

    it('describes itself for the line editor', () => {
        const widget = new BlockLimitTimerWidget();

        expect(widget.getDisplayName()).toBe('Block Limit Timer');
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getDefaultColor()).toBe('red');
        expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(COMPACT).modifierText).toBe('(compact)');
    });

    it('toggles the short form with s', () => {
        const widget = new BlockLimitTimerWidget();

        expect(widget.getCustomKeybinds()).toEqual([{ key: 's', label: '(s)hort time', action: 'toggle-compact' }]);
        expect(widget.handleEditorAction('toggle-compact', ITEM)?.metadata?.compact).toBe('true');
        expect(widget.handleEditorAction('toggle-invert', ITEM)).toBeNull();
    });
});
