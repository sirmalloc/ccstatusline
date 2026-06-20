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
import { ExtraUsageUsedWidget } from '../ExtraUsageUsed';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: ExtraUsageUsedWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageUsedWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders used extra usage budget', () => {
        const widget = new ExtraUsageUsedWidget();
        const context: RenderContext = {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUsed: 10600
            }
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, context)).toBe('Overage Used: $106.00');
        expect(render(widget, {
            id: 'extra',
            rawValue: true,
            type: 'extra-usage-used'
        }, context)).toBe('$106.00');
    });

    it('renders used budget without a configured monthly limit', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUsed: 542
            }
        })).toBe('Overage Used: $5.42');
    });

    it('formats used budget in the currency reported by the API', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                extraUsageCurrency: 'EUR',
                extraUsageEnabled: true,
                extraUsageUsed: 542
            }
        })).toBe('Overage Used: €5.42');
    });

    it('declares the disabled and no-data hideable states', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
        expect(widget.getEditorDisplay({ id: 'extra', type: 'extra-usage-used' }).modifierText).toBeUndefined();
    });

    it('renders available used budget before unrelated usage errors', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: true,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Used: $106.00');
    });

    it('shows usage errors only when required extra usage data is missing', () => {
        const widget = new ExtraUsageUsedWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, { usageData: { extraUsageEnabled: true } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled', () => {
        const widget = new ExtraUsageUsedWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-used' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: false,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Used: n/a');
        expect(render(widget, { id: 'extra', rawValue: true, type: 'extra-usage-used' }, { usageData: { extraUsageEnabled: false } })).toBe('n/a');
    });

    it('hides when extra usage is disabled and hide-if-disabled is enabled', () => {
        const widget = new ExtraUsageUsedWidget();

        const hiddenItem: WidgetItem = {
            id: 'extra',
            metadata: { hide: 'disabled' },
            type: 'extra-usage-used'
        };

        expect(render(widget, hiddenItem, { usageData: { extraUsageEnabled: false } })).toBeNull();
    });
});
