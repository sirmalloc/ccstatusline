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
import { WeeklyUsageWidget } from '../WeeklyUsage';

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

function render(widget: WeeklyUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
        // makeUsageProgressBar no longer used; WeeklyUsage uses makeTimerProgressBar directly
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the time cursor in short bar modes', () => {
        const widget = new WeeklyUsageWidget();
        const context: RenderContext = { usageData: { weeklyUsage: 20 } };

        vi.spyOn(usage, 'resolveWeeklyUsageWindow').mockReturnValue(halfElapsedWindow);

        expect(render(widget, {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: { cursor: 'true', display: 'slider' }
        }, context)).toBe('Weekly: ▓▓░░░│░░░░ 20.0%');
        expect(render(widget, {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: { cursor: 'true', display: 'slider-only' }
        }, context)).toBe('Weekly: ▓▓░░░│░░░░');
    });

    runUsagePercentWidgetSuite({
        baseItem: { id: 'weekly', type: 'weekly-usage' },
        createWidget: () => new WeeklyUsageWidget(),
        errorMessageMock: usageErrorMessageMock,
        expectedModifierText: '(long bar, inverted)',
        expectedProgress: 'Weekly: [███████████████████░░░░░░░░░░░░░] 57.9%',
        expectedRawProgress: '[███████░░░░░░░░░] 42.1%',
        expectedRawTime: '42.1%',
        expectedTime: 'Weekly: 42.1%',
        modifierItem: {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        progressItem: {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        rawProgressItem: {
            id: 'weekly',
            type: 'weekly-usage',
            rawValue: true,
            metadata: { display: 'progress-short' }
        },
        rawTimeItem: {
            id: 'weekly',
            type: 'weekly-usage',
            rawValue: true
        },
        render,
        usageField: 'weeklyUsage',
        usageValue: 42.06
    });
});
