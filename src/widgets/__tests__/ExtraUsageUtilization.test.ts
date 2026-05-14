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
                extraUsageUtilization: 0.25
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
                extraUsageUtilization: 0.026
            }
        })).toBe('Overage: 2.6%');
    });

    it('shows usage errors only when required extra usage data is missing', () => {
        const widget = new ExtraUsageUtilizationWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, { usageData: { extraUsageEnabled: true } })).toBeNull();
    });

    it('does not render when extra usage is disabled', () => {
        const widget = new ExtraUsageUtilizationWidget();

        expect(render(widget, { id: 'extra', type: 'extra-usage-utilization' }, {
            usageData: {
                error: 'timeout',
                extraUsageEnabled: false,
                extraUsageUtilization: 0.25
            }
        })).toBeNull();
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
                extraUsageUtilization: 0.25
            }
        })).toBe('Overage: [████████████░░░░] 75.0%');
    });
});
