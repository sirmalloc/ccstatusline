import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { ExtraUsageDailyBudgetWidget } from '../ExtraUsageDailyBudget';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

const item: WidgetItem = { id: 'budget', type: 'extra-usage-daily-budget' };
const weekdaysItem: WidgetItem = { ...item, metadata: { weekdaysOnly: 'true' } };

// $123.45 spent of a $500 monthly limit: $376.55 left.
const usageData = {
    extraUsageEnabled: true,
    extraUsageLimit: 50000,
    extraUsageUsed: 12345
};

function render(widget: ExtraUsageDailyBudgetWidget, widgetItem: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(widgetItem, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageDailyBudgetWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
        // Monday 5 October 2026: 27 days left in the month, 20 of them weekdays.
        vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-05T15:00:00Z').getTime());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('divides what is left of the monthly limit by the days left', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(render(widget, item, { usageData })).toBe('Daily Budget: $13.95');
        expect(render(widget, { ...item, rawValue: true }, { usageData })).toBe('$13.95');
    });

    it('counts only weekdays when that option is on', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(render(widget, weekdaysItem, { usageData })).toBe('Daily Budget: $18.83');
    });

    it('shows no budget once the limit is used up', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 50000,
                extraUsageUsed: 52000
            }
        })).toBe('Daily Budget: $0.00');
    });

    it('formats the budget in the currency reported by the API', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(render(widget, item, { usageData: { ...usageData, extraUsageCurrency: 'EUR' } })).toBe('Daily Budget: €13.95');
    });

    it('renders nothing without a monthly limit to divide', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(render(widget, item, { usageData: { extraUsageEnabled: true, extraUsageUsed: 542 } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled, or nothing when that state is hidden', () => {
        const widget = new ExtraUsageDailyBudgetWidget();
        const context: RenderContext = { usageData: { extraUsageEnabled: false } };

        expect(render(widget, item, context)).toBe('Daily Budget: n/a');
        expect(render(widget, { ...item, metadata: { hide: 'disabled' } }, context)).toBeNull();
    });

    it('shows usage errors only when the extra usage data is missing', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, item, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { ...item, metadata: { hide: 'no-data' } }, { usageData: { error: 'timeout' } })).toBeNull();
        expect(render(widget, item, { usageData: { ...usageData, error: 'timeout' } })).toBe('Daily Budget: $13.95');
    });

    it('renders a fixed sample in the preview, whatever the date', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        // The Extra Usage Remaining sample ($3,894.00) over 20 days.
        expect(render(widget, item, { isPreview: true })).toBe('Daily Budget: $194.70');
        expect(render(widget, weekdaysItem, { isPreview: true })).toBe('Daily Budget: $194.70');
    });

    it('toggles weekdays only from the editor and shows it on the editor row', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(widget.getCustomKeybinds(item)).toEqual([
            { key: 'w', label: '(w)eekdays only', action: 'toggle-weekdays' }
        ]);
        expect(widget.getCustomKeybinds(weekdaysItem)).toEqual([
            { key: 'w', label: '(w) count weekends', action: 'toggle-weekdays' }
        ]);
        expect(widget.getEditorDisplay(item).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(weekdaysItem).modifierText).toBe('(weekdays)');

        const toggledOn = widget.handleEditorAction('toggle-weekdays', item);
        expect(toggledOn?.metadata?.weekdaysOnly).toBe('true');
        expect(widget.handleEditorAction('toggle-weekdays', weekdaysItem)?.metadata?.weekdaysOnly).toBe('false');
        expect(widget.handleEditorAction('unknown-action', item)).toBeNull();
    });

    it('declares the disabled and no-data hideable states', () => {
        const widget = new ExtraUsageDailyBudgetWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
        expect(widget.getCategory()).toBe('Usage');
    });
});
