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
import { SessionCostRateWidget } from '../SessionCostRate';

const item: WidgetItem = { id: 'rate', type: 'session-cost-rate' };
const clockItem: WidgetItem = { ...item, metadata: { clockTime: 'true' } };

// $2.50 over a 2-hour session in which Claude worked for 30 minutes.
const context: RenderContext = {
    data: {
        cost: {
            total_cost_usd: 2.5,
            total_duration_ms: 2 * 60 * 60 * 1000,
            total_api_duration_ms: 30 * 60 * 1000
        }
    }
};

function render(widgetItem: WidgetItem, renderContext: RenderContext = {}): string | null {
    return new SessionCostRateWidget().render(widgetItem, renderContext, DEFAULT_SETTINGS);
}

describe('SessionCostRateWidget', () => {
    it('divides the session cost by the time Claude spent working', () => {
        expect(render(item, context)).toBe('Rate: $5.00/hr');
        expect(render({ ...item, rawValue: true }, context)).toBe('$5.00/hr');
    });

    it('divides by the whole session time when clock time is on', () => {
        expect(render(clockItem, context)).toBe('Rate: $1.25/hr');
    });

    it('waits for a full minute of the chosen time before showing a rate', () => {
        const early: RenderContext = { data: { cost: { total_cost_usd: 0.1, total_duration_ms: 59_000, total_api_duration_ms: 59_000 } } };
        const oneMinute: RenderContext = { data: { cost: { total_cost_usd: 0.1, total_duration_ms: 60_000, total_api_duration_ms: 60_000 } } };

        expect(render(item, early)).toBeNull();
        expect(render(clockItem, early)).toBeNull();
        expect(render(item, oneMinute)).toBe('Rate: $6.00/hr');
    });

    it('renders nothing without a cost or a duration', () => {
        expect(render(item, {})).toBeNull();
        expect(render(item, { data: { cost: { total_api_duration_ms: 1_800_000 } } })).toBeNull();
        expect(render(item, { data: { cost: { total_cost_usd: 2.5 } } })).toBeNull();
        expect(render(clockItem, { data: { cost: { total_cost_usd: 2.5, total_api_duration_ms: 1_800_000 } } })).toBeNull();
    });

    it('applies the cost number format', () => {
        expect(render({ ...item, numberFormat: { style: 'whole' } }, context)).toBe('Rate: $5/hr');
    });

    it('renders a sample rate in the preview', () => {
        // The Session Cost sample ($2.45) over 30 minutes.
        expect(render(item, { isPreview: true })).toBe('Rate: $4.90/hr');
    });

    it('toggles clock time from the editor and names the time used on the editor row', () => {
        const widget = new SessionCostRateWidget();

        expect(widget.getCustomKeybinds(item)).toEqual([
            { key: 't', label: '(t)ime: use clock time', action: 'toggle-clock-time' }
        ]);
        expect(widget.getCustomKeybinds(clockItem)).toEqual([
            { key: 't', label: '(t)ime: use active time', action: 'toggle-clock-time' }
        ]);
        expect(widget.getEditorDisplay(item).modifierText).toBe('(active time)');
        expect(widget.getEditorDisplay(clockItem).modifierText).toBe('(clock time)');

        expect(widget.handleEditorAction('toggle-clock-time', item)?.metadata?.clockTime).toBe('true');
        expect(widget.handleEditorAction('toggle-clock-time', clockItem)?.metadata?.clockTime).toBe('false');
        expect(widget.handleEditorAction('unknown-action', item)).toBeNull();
    });

    it('sits with Session Cost in the Session category', () => {
        expect(new SessionCostRateWidget().getCategory()).toBe('Session');
    });
});
