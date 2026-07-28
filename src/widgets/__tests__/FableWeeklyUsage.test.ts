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
import { FableWeeklyUsageWidget } from '../FableWeeklyUsage';

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

function render(widget: FableWeeklyUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('FableWeeklyUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the time cursor in short bar modes', () => {
        const widget = new FableWeeklyUsageWidget();
        const context: RenderContext = { usageData: { fableUsage: 20 } };

        vi.spyOn(usage, 'resolveFableUsageWindow').mockReturnValue(halfElapsedWindow);

        expect(render(widget, {
            id: 'fable-weekly',
            type: 'fable-weekly-usage',
            metadata: { cursor: 'true', display: 'slider' }
        }, context)).toBe('Fable Weekly: ▓▓░░░│░░░░ 20.0%');
        expect(render(widget, {
            id: 'fable-weekly',
            type: 'fable-weekly-usage',
            metadata: { cursor: 'true', display: 'slider-only' }
        }, context)).toBe('Fable Weekly: ▓▓░░░│░░░░');
    });

    it('returns null when the per-model usage is missing from the API response', () => {
        const widget = new FableWeeklyUsageWidget();
        expect(render(widget, { id: 'fable-weekly', type: 'fable-weekly-usage' }, { usageData: {} })).toBeNull();
    });

    runUsagePercentWidgetSuite({
        baseItem: { id: 'fable-weekly', type: 'fable-weekly-usage' },
        createWidget: () => new FableWeeklyUsageWidget(),
        errorMessageMock: usageErrorMessageMock,
        expectedInvertedTime: 'Fable Weekly: 57.9%',
        expectedModifierText: '(long bar, remaining)',
        expectedPreviewInvertedTime: 'Fable Weekly: 96.0%',
        expectedProgress: 'Fable Weekly: [███████████████████░░░░░░░░░░░░░] 57.9%',
        expectedRawInvertedTime: '57.9%',
        expectedRawProgress: '[███████░░░░░░░░░] 42.1%',
        expectedRawTime: '42.1%',
        expectedTime: 'Fable Weekly: 42.1%',
        modifierItem: {
            id: 'fable-weekly',
            type: 'fable-weekly-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        progressItem: {
            id: 'fable-weekly',
            type: 'fable-weekly-usage',
            metadata: { display: 'progress', invert: 'true' }
        },
        rawProgressItem: {
            id: 'fable-weekly',
            type: 'fable-weekly-usage',
            rawValue: true,
            metadata: { display: 'progress-short' }
        },
        rawTimeItem: {
            id: 'fable-weekly',
            type: 'fable-weekly-usage',
            rawValue: true
        },
        render,
        usageField: 'fableUsage',
        usageValue: 42.06
    });
});
