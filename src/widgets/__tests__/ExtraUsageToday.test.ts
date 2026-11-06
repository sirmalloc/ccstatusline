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
import { ExtraUsageTodayWidget } from '../ExtraUsageToday';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

const item: WidgetItem = { id: 'today', type: 'extra-usage-today' };

// $123.45 spent this month, $46.10 of it today.
const usageData = {
    extraUsageEnabled: true,
    extraUsageUsed: 12345,
    extraUsageUsedToday: 4610
};

function render(widgetItem: WidgetItem, context: RenderContext = {}): string | null {
    return new ExtraUsageTodayWidget().render(widgetItem, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageTodayWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows the extra usage spent today', () => {
        expect(render(item, { usageData })).toBe('Overage Today: $46.10');
        expect(render({ ...item, rawValue: true }, { usageData })).toBe('$46.10');
    });

    it('formats the amount in the currency reported by the API', () => {
        expect(render(item, { usageData: { ...usageData, extraUsageCurrency: 'EUR' } })).toBe('Overage Today: €46.10');
    });

    it('applies the global cost style', () => {
        const settings = { ...DEFAULT_SETTINGS, numberFormat: { cost: { style: 'whole' as const } } };
        const widget = new ExtraUsageTodayWidget();

        expect(widget.render(item, { usageData }, settings)).toBe('Overage Today: $46');
        expect(widget.supportsNumberFormat()).toBe(true);
    });

    // Today's spend only exists once a usage fetch has run since the UTC day
    // began; until then there is nothing to show.
    it('renders nothing while today\'s spend is not known yet', () => {
        expect(render(item, { usageData: { extraUsageEnabled: true, extraUsageUsed: 12345 } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled, or nothing when that state is hidden', () => {
        const context: RenderContext = { usageData: { extraUsageEnabled: false } };

        expect(render(item, context)).toBe('Overage Today: n/a');
        expect(render({ ...item, metadata: { hide: 'disabled' } }, context)).toBeNull();
    });

    it('shows usage errors only when the extra usage data is missing', () => {
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(item, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render({ ...item, metadata: { hide: 'no-data' } }, { usageData: { error: 'timeout' } })).toBeNull();
        expect(render(item, { usageData: { ...usageData, error: 'timeout' } })).toBe('Overage Today: $46.10');
    });

    it('renders a sample amount in the preview', () => {
        expect(render(item, { isPreview: true })).toBe('Overage Today: $46.10');
    });

    it('declares the disabled and no-data hideable states', () => {
        const widget = new ExtraUsageTodayWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
        expect(widget.getCategory()).toBe('Usage');
    });
});
