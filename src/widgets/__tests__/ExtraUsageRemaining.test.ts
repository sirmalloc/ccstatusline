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
import { ExtraUsageRemainingWidget } from '../ExtraUsageRemaining';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: ExtraUsageRemainingWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageRemainingWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders remaining extra usage budget', () => {
        const widget = new ExtraUsageRemainingWidget();
        const context: RenderContext = {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 400000,
                extraUsageUsed: 10600
            }
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, context)).toBe('Overage Left: $3,894.00');
        expect(render(widget, {
            id: 'extra',
            rawValue: true,
            type: 'extra-usage-remaining'
        }, context)).toBe('$3,894.00');
    });

    it('formats remaining budget in the currency reported by the API', () => {
        const widget = new ExtraUsageRemainingWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, {
            usageData: {
                extraUsageCurrency: 'EUR',
                extraUsageEnabled: true,
                extraUsageLimit: 400000,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Left: €3,894.00');
    });

    it('clamps remaining budget at zero', () => {
        const widget = new ExtraUsageRemainingWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 1000,
                extraUsageUsed: 1500
            }
        })).toBe('Overage Left: $0.00');
    });

    it('exposes and toggles hide-if-disabled configuration', () => {
        const widget = new ExtraUsageRemainingWidget();
        const baseItem: WidgetItem = { id: 'extra', type: 'extra-usage-remaining' };

        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'h', label: '(h)ide if disabled', action: 'toggle-hide-disabled' }
        ]);
        expect(widget.getEditorDisplay(baseItem).modifierText).toBeUndefined();

        const hidden = widget.handleEditorAction('toggle-hide-disabled', baseItem);
        expect(hidden?.metadata?.hideIfDisabled).toBe('true');
        expect(widget.getEditorDisplay(hidden ?? baseItem).modifierText).toBe('(hide if disabled)');

        const shown = widget.handleEditorAction('toggle-hide-disabled', hidden ?? baseItem);
        expect(shown?.metadata?.hideIfDisabled).toBe('false');
    });

    it('renders available remaining budget before unrelated usage errors', () => {
        const widget = new ExtraUsageRemainingWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: true,
                extraUsageLimit: 400000,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Left: $3,894.00');
    });

    it('shows usage errors only when required extra usage data is missing', () => {
        const widget = new ExtraUsageRemainingWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 400000
            }
        })).toBeNull();
    });

    it('renders n/a when extra usage is disabled', () => {
        const widget = new ExtraUsageRemainingWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-remaining' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: false,
                extraUsageLimit: 400000,
                extraUsageUsed: 10600
            }
        })).toBe('Overage Left: n/a');
        expect(render(widget, { id: 'extra', rawValue: true, type: 'extra-usage-remaining' }, { usageData: { extraUsageEnabled: false } })).toBe('n/a');
    });

    it('hides when extra usage is disabled and hide-if-disabled is enabled', () => {
        const widget = new ExtraUsageRemainingWidget();

        const hiddenItem: WidgetItem = {
            id: 'extra',
            metadata: { hideIfDisabled: 'true' },
            type: 'extra-usage-remaining'
        };

        expect(render(widget, hiddenItem, { usageData: { extraUsageEnabled: false } })).toBeNull();
    });
});
