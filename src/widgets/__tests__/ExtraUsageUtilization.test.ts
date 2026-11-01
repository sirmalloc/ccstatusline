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
import { ExtraUsageUtilizationWidget } from '../ExtraUsageUtilization';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: ExtraUsageUtilizationWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ExtraUsageUtilizationWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders utilization text and bar modes', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const context: RenderContext = {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        };

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, context)).toBe('Overage: 25.0%');
        expect(render(widget, {
            id: 'extra',
            rawValue: true,
            type: 'extra-usage-utilization'
        }, context)).toBe('25.0%');
        expect(render(widget, {
            id: 'extra',
            metadata: { display: 'progress-short' },
            type: 'extra-usage-utilization'
        }, context)).toBe('Overage: [████░░░░░░░░░░░░] 25.0%');
        expect(render(widget, {
            id: 'extra',
            metadata: { display: 'slider-only' },
            type: 'extra-usage-utilization'
        }, context)).toBe('Overage: ▓▓▓░░░░░░░');
    });

    it('renders available utilization before unrelated usage errors', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: true,
                extraUsageUtilization: 2.6
            }
        })).toBe('Overage: 2.6%');
    });

    // The usage API reports `utilization: null` until the first charge of the
    // month, while still reporting the amount spent and the monthly limit.
    it('derives utilization from spent and limit when the API reports none', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const item: WidgetItem = { id: 'extra', type: 'extra-usage-utilization' };

        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 5000,
                extraUsageUsed: 0
            }
        })).toBe('Overage: 0.0%');
        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 5000,
                extraUsageUsed: 1250
            }
        })).toBe('Overage: 25.0%');
    });

    it('prefers the API-reported utilization over the derived one', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 5000,
                extraUsageUsed: 1250,
                extraUsageUtilization: 40
            }
        })).toBe('Overage: 40.0%');
    });

    it('renders nothing without a usable monthly limit to derive utilization from', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const item: WidgetItem = { id: 'extra', type: 'extra-usage-utilization' };

        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUsed: 1250
            }
        })).toBeNull();
        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageLimit: 0,
                extraUsageUsed: 0
            }
        })).toBeNull();
    });

    it('declares the disabled and no-data hideable states alongside display keybinds', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const baseItem: WidgetItem = { id: 'extra', type: 'extra-usage-utilization' };

        expect(widget.getCustomKeybinds(baseItem)).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'u', label: '(u) show remaining', action: 'toggle-invert' }
        ]);
        expect(widget.getCustomKeybinds({
            ...baseItem,
            metadata: { display: 'progress' }
        })).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'u', label: '(u) show remaining', action: 'toggle-invert' }
        ]);
        expect(widget.getCustomKeybinds({
            ...baseItem,
            metadata: { invert: 'true' }
        })).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'u', label: '(u) show used', action: 'toggle-invert' }
        ]);
        expect(widget.getEditorDisplay(baseItem).modifierText).toBe('(used)');
        expect(widget.getEditorDisplay({
            ...baseItem,
            metadata: { invert: 'true' }
        }).modifierText).toBe('(remaining)');

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['disabled', 'no-data']);
    });

    it('does not show a time cursor carried over from a usage widget', () => {
        // A usage bar's cursor metadata survives a type change in the picker,
        // but this widget never draws a cursor
        const widget = new ExtraUsageUtilizationWidget();

        const modifierText = widget.getEditorDisplay({
            id: 'extra',
            type: 'extra-usage-utilization',
            metadata: { display: 'progress', cursor: 'true' }
        }).modifierText;

        expect(modifierText).toContain('bar');
        expect(modifierText).not.toContain('time cursor');
    });

    it('shows usage errors only when required extra usage data is missing', () => {
        const widget = new ExtraUsageUtilizationWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, { usageData: { extraUsageEnabled: true } })).toBeNull();
    });

    it('hides usage errors when the no-data state is enabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, {
            id: 'extra',
            metadata: { hide: 'no-data' },
            type: 'extra-usage-utilization'
        }, { usageData: { error: 'timeout' } })).toBeNull();
    });

    it('renders n/a when extra usage is disabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: false,
                extraUsageUtilization: 25
            }
        })).toBe('Overage: n/a');
        const rawProgressItem: WidgetItem = {
            id: 'extra',
            metadata: { display: 'progress-short' },
            rawValue: true,
            type: 'extra-usage-utilization'
        };

        expect(render(widget, rawProgressItem, { usageData: { extraUsageEnabled: false } })).toBe('n/a');
    });

    it('hides when extra usage is disabled and hide-if-disabled is enabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        const hiddenItem: WidgetItem = {
            id: 'extra',
            metadata: { hide: 'disabled' },
            type: 'extra-usage-utilization'
        };

        expect(render(widget, hiddenItem, { usageData: { extraUsageEnabled: false } })).toBeNull();
    });

    it('inverts bar rendering', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, {
            id: 'extra',
            metadata: { display: 'progress-short', invert: 'true' },
            type: 'extra-usage-utilization'
        }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        })).toBe('Overage: [████████████░░░░] 75.0%');
    });

    it('inverts plain text and preview rendering', () => {
        const widget = new ExtraUsageUtilizationWidget();
        const item: WidgetItem = {
            id: 'extra',
            metadata: { invert: 'true' },
            type: 'extra-usage-utilization'
        };

        expect(render(widget, item, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        })).toBe('Overage: 75.0%');
        expect(render(widget, { ...item, rawValue: true }, {
            usageData: {
                extraUsageEnabled: true,
                extraUsageUtilization: 25
            }
        })).toBe('75.0%');
        expect(render(widget, item, { isPreview: true })).toBe('Overage: 97.4%');
    });
});
