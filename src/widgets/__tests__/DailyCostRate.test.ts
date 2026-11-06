import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { DailyCostRateWidget } from '../DailyCostRate';

const item: WidgetItem = { id: 'rate', type: 'daily-cost-rate' };
const clockItem: WidgetItem = { ...item, metadata: { clockTime: 'true' } };
const billedItem: WidgetItem = { ...item, metadata: { billedSpend: 'true' } };

// $6.20 of Claude Code cost today, over 1 hour of Claude working and 2 hours
// of sessions running.
const context: RenderContext = { dailyCost: { claudeCodeCost: 6.2, activeMs: 60 * 60 * 1000, clockMs: 2 * 60 * 60 * 1000 } };

function render(widgetItem: WidgetItem, renderContext: RenderContext = {}): string | null {
    return new DailyCostRateWidget().render(widgetItem, renderContext, DEFAULT_SETTINGS);
}

describe('DailyCostRateWidget', () => {
    it('divides today\'s Claude Code cost by the time Claude spent working', () => {
        expect(render(item, context)).toBe('Rate Today: $6.20/hr');
        expect(render({ ...item, rawValue: true }, context)).toBe('$6.20/hr');
    });

    it('offers its label to the label editor, and draws an edited one', () => {
        expect(new DailyCostRateWidget().getLabelPrefix()).toBe('Rate Today: ');
        expect(render({ ...item, metadata: { label: 'Today: ' } }, context)).toBe('Today: $6.20/hr');
    });

    it('divides by the time sessions were running when clock time is on', () => {
        expect(render(clockItem, context)).toBe('Rate Today: $3.10/hr');
    });

    it('divides today\'s billed spend when that option is on', () => {
        expect(render(billedItem, {
            ...context,
            usageData: { extraUsageEnabled: true, extraUsageUsed: 12345, extraUsageUsedToday: 1240 }
        })).toBe('Rate Today: $12.40/hr');
    });

    it('shows billed spend in the currency the usage API reports', () => {
        expect(render(billedItem, {
            ...context,
            usageData: { extraUsageEnabled: true, extraUsageUsed: 12000, extraUsageUsedToday: 5000, extraUsageCurrency: 'EUR' }
        })).toBe('Rate Today: €50.00/hr');
    });

    it('renders nothing with billed spend on until today\'s spend is known', () => {
        expect(render(billedItem, { ...context, usageData: { extraUsageEnabled: true, extraUsageUsed: 12345 } })).toBeNull();
        expect(render(billedItem, context)).toBeNull();
    });

    it('waits for a full minute of the chosen time before showing a rate', () => {
        const early: RenderContext = { dailyCost: { claudeCodeCost: 0.1, activeMs: 59_000, clockMs: 59_000 } };
        const oneMinute: RenderContext = { dailyCost: { claudeCodeCost: 0.1, activeMs: 60_000, clockMs: 60_000 } };

        expect(render(item, early)).toBeNull();
        expect(render(clockItem, early)).toBeNull();
        expect(render(item, oneMinute)).toBe('Rate Today: $6.00/hr');
    });

    it('renders nothing without today\'s totals', () => {
        expect(render(item, {})).toBeNull();
        expect(render(item, { dailyCost: null })).toBeNull();
    });

    it('applies the cost number format', () => {
        expect(render({ ...item, numberFormat: { style: 'whole' } }, context)).toBe('Rate Today: $6/hr');
    });

    it('renders a sample rate in the preview', () => {
        expect(render(item, { isPreview: true })).toBe('Rate Today: $6.20/hr');
    });

    it('toggles clock time and billed spend from the editor and names both on the editor row', () => {
        const widget = new DailyCostRateWidget();
        const bothItem: WidgetItem = { ...item, metadata: { clockTime: 'true', billedSpend: 'true' } };

        expect(widget.getCustomKeybinds(item)).toEqual([
            { key: 't', label: '(t)ime: use clock time', action: 'toggle-clock-time' },
            { key: 'b', label: '(b)illed spend', action: 'toggle-billed-spend' }
        ]);
        expect(widget.getCustomKeybinds(bothItem)).toEqual([
            { key: 't', label: '(t)ime: use active time', action: 'toggle-clock-time' },
            { key: 'b', label: '(b) Claude Code cost', action: 'toggle-billed-spend' }
        ]);
        expect(widget.getEditorDisplay(item).modifierText).toBe('(active time, Claude Code cost)');
        expect(widget.getEditorDisplay(bothItem).modifierText).toBe('(clock time, billed spend)');

        expect(widget.handleEditorAction('toggle-clock-time', item)?.metadata?.clockTime).toBe('true');
        expect(widget.handleEditorAction('toggle-billed-spend', item)?.metadata?.billedSpend).toBe('true');
        expect(widget.handleEditorAction('toggle-billed-spend', billedItem)?.metadata?.billedSpend).toBe('false');
        expect(widget.handleEditorAction('unknown-action', item)).toBeNull();
    });

    it('sits in the Session category', () => {
        expect(new DailyCostRateWidget().getCategory()).toBe('Session');
    });
});
