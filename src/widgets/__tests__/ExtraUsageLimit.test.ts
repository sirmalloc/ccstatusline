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
import { ExtraUsageLimitWidget } from '../ExtraUsageLimit';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: ExtraUsageLimitWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageLimitWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the monthly extra usage limit', () => {
        const widget = new ExtraUsageLimitWidget();
        const context: RenderContext = {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 50000,
                extraUsageUsed: 12345
            }
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, context)).toBe('Overage Limit: $500.00');
        expect(render(widget, {
            id: 'extra',
            rawValue: true,
            type: 'extra-usage-limit'
        }, context)).toBe('$500.00');
    });

    it('formats the limit in the currency reported by the API', () => {
        const widget = new ExtraUsageLimitWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, {
            usageData: {
                extraUsageCurrency: 'EUR',
                extraUsageEnabled: true,
                extraUsageLimit: 5000
            }
        })).toBe('Overage Limit: €50.00');
    });

    it('applies the global cost style while preserving the reported currency', () => {
        const widget = new ExtraUsageLimitWidget();
        const settings = {
            ...DEFAULT_SETTINGS,
            numberFormat: { cost: { style: 'whole' as const } }
        };

        expect(widget.render({ id: 'extra', type: 'extra-usage-limit' }, {
            usageData: {
                extraUsageCurrency: 'EUR',
                extraUsageEnabled: true,
                extraUsageLimit: 5000
            }
        }, settings)).toBe('Overage Limit: €50');
        expect(widget.render({ id: 'extra', type: 'extra-usage-limit' }, { isPreview: true }, settings)).toBe('Overage Limit: $4,000');
        expect(widget.supportsNumberFormat()).toBe(true);
    });

    // Once the API has reported extra usage as enabled, a missing monthly limit
    // means none is set (an unlimited Enterprise member, or a Pro/Max account
    // without a cap), not that the data is still loading.
    it('renders none when extra usage is enabled without a monthly limit', () => {
        const widget = new ExtraUsageLimitWidget();
        const context: RenderContext = { usageData: { extraUsageEnabled: true, extraUsageUsed: 542 } };

        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, context)).toBe('Overage Limit: none');
        expect(render(widget, { id: 'extra', rawValue: true, type: 'extra-usage-limit' }, context)).toBe('none');
    });

    it('renders n/a when extra usage is disabled, or nothing when that state is hidden', () => {
        const widget = new ExtraUsageLimitWidget();
        const context: RenderContext = { usageData: { extraUsageEnabled: false } };

        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, context)).toBe('Overage Limit: n/a');
        expect(render(widget, {
            id: 'extra',
            metadata: { hide: 'disabled' },
            type: 'extra-usage-limit'
        }, context)).toBeNull();
    });

    it('shows usage errors only when extra usage state is unknown', () => {
        const widget = new ExtraUsageLimitWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, {
            id: 'extra',
            metadata: { hide: 'no-data' },
            type: 'extra-usage-limit'
        }, { usageData: { error: 'timeout' } })).toBeNull();
        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, {})).toBeNull();
        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: true,
                extraUsageLimit: 50000
            }
        })).toBe('Overage Limit: $500.00');
    });

    it('renders a sample limit in the preview that matches the Used and Remaining samples', () => {
        const widget = new ExtraUsageLimitWidget();

        // Extra Usage Used previews $106.00 and Extra Usage Remaining $3,894.00.
        expect(render(widget, { id: 'extra', type: 'extra-usage-limit' }, { isPreview: true })).toBe('Overage Limit: $4,000.00');
    });

    it('declares the disabled and no-data hideable states', () => {
        const widget = new ExtraUsageLimitWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
        expect(widget.getCategory()).toBe('Usage');
    });
});
