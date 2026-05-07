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
import { WeeklyOpusUsageWidget } from '../WeeklyOpusUsage';

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

function render(widget: WeeklyOpusUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyOpusUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the time cursor in short bar modes', () => {
        const widget = new WeeklyOpusUsageWidget();
        const context: RenderContext = { usageData: { weeklyOpusUsage: 20 } };

        vi.spyOn(usage, 'resolveWeeklyOpusUsageWindow').mockReturnValue(halfElapsedWindow);

        expect(render(widget, {
            id: 'weekly-opus',
            type: 'weekly-opus-usage',
            metadata: { cursor: 'true', display: 'slider' }
        }, context)).toBe('Weekly Opus: ▓▓░░░│░░░░ 20.0%');
        expect(render(widget, {
            id: 'weekly-opus',
            type: 'weekly-opus-usage',
            metadata: { cursor: 'true', display: 'slider-only' }
        }, context)).toBe('Weekly Opus: ▓▓░░░│░░░░');
    });

    it('returns null when the per-model usage is missing from the API response', () => {
        const widget = new WeeklyOpusUsageWidget();
        expect(render(widget, { id: 'weekly-opus', type: 'weekly-opus-usage' }, { usageData: {} })).toBeNull();
    });

    runUsagePercentWidgetSuite({
        baseItem: { id: 'weekly-opus', type: 'weekly-opus-usage' },
        createWidget: () => new WeeklyOpusUsageWidget(),
        errorMessageMock: usageErrorMessageMock,
        expectedModifierText: '(long bar, inverted)',
        expectedProgress: 'Weekly Opus: [███████████████████░░░░░░░░░░░░░] 57.9%',
        expectedRawProgress: '[███████░░░░░░░░░] 42.1%',
        expectedRawTime: '42.1%',
        expectedTime: 'Weekly Opus: 42.1%',
        modifierItem: {
            id: 'weekly-opus',
            type: 'weekly-opus-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        progressItem: {
            id: 'weekly-opus',
            type: 'weekly-opus-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        rawProgressItem: {
            id: 'weekly-opus',
            type: 'weekly-opus-usage',
            rawValue: true,
            metadata: { display: 'progress-short' }
        },
        rawTimeItem: {
            id: 'weekly-opus',
            type: 'weekly-opus-usage',
            rawValue: true
        },
        render,
        usageField: 'weeklyOpusUsage',
        usageValue: 42.06
    });
});
