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
