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
import type { UsageWindowMetrics } from '../../utils/usage-types';
import { WeeklySonnetUsageWidget } from '../WeeklySonnetUsage';

import { runUsagePercentWidgetSuite } from './helpers/usage-widget-suites';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };
const usageErrorMessageMock = {
    mockReturnValue(value: string): void {
        mockGetUsageErrorMessage.mockReturnValue(value);
    }
};

const halfElapsedWindow: UsageWindowMetrics = {
    sessionDurationMs: 604800000,
    elapsedMs: 302400000,
    remainingMs: 302400000,
    elapsedPercent: 50,
    remainingPercent: 50
};

function render(widget: WeeklySonnetUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklySonnetUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the time cursor in short bar modes', () => {
        const widget = new WeeklySonnetUsageWidget();
        const context: RenderContext = { usageData: { weeklySonnetUsage: 20 } };

        vi.spyOn(usage, 'resolveWeeklySonnetUsageWindow').mockReturnValue(halfElapsedWindow);

        expect(render(widget, {
            id: 'weekly-sonnet',
            type: 'weekly-sonnet-usage',
            metadata: { cursor: 'true', display: 'slider' }
        }, context)).toBe('Weekly Sonnet: ▓▓░░░│░░░░ 20.0%');
        expect(render(widget, {
            id: 'weekly-sonnet',
            type: 'weekly-sonnet-usage',
            metadata: { cursor: 'true', display: 'slider-only' }
        }, context)).toBe('Weekly Sonnet: ▓▓░░░│░░░░');
    });

    it('returns null when the per-model usage is missing from the API response', () => {
        const widget = new WeeklySonnetUsageWidget();
        expect(render(widget, { id: 'weekly-sonnet', type: 'weekly-sonnet-usage' }, { usageData: {} })).toBeNull();
    });

    runUsagePercentWidgetSuite({
        baseItem: { id: 'weekly-sonnet', type: 'weekly-sonnet-usage' },
        createWidget: () => new WeeklySonnetUsageWidget(),
        errorMessageMock: usageErrorMessageMock,
        expectedModifierText: '(long bar, inverted)',
        expectedProgress: 'Weekly Sonnet: [███████████████████░░░░░░░░░░░░░] 57.9%',
        expectedRawProgress: '[███████░░░░░░░░░] 42.1%',
        expectedRawTime: '42.1%',
        expectedTime: 'Weekly Sonnet: 42.1%',
        modifierItem: {
            id: 'weekly-sonnet',
            type: 'weekly-sonnet-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        progressItem: {
            id: 'weekly-sonnet',
            type: 'weekly-sonnet-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        rawProgressItem: {
            id: 'weekly-sonnet',
            type: 'weekly-sonnet-usage',
            rawValue: true,
            metadata: { display: 'progress-short' }
        },
        rawTimeItem: {
            id: 'weekly-sonnet',
            type: 'weekly-sonnet-usage',
            rawValue: true
        },
        render,
        usageField: 'weeklySonnetUsage',
        usageValue: 42.06
    });
});
