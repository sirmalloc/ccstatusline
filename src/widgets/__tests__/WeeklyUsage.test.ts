import {
    describe,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getUsageErrorMessage } from '../../utils/usage';
import { WeeklyUsageWidget } from '../WeeklyUsage';

import { runUsagePercentWidgetSuite } from './helpers/usage-widget-suites';

vi.mock('../../utils/usage', () => ({
    getUsageErrorMessage: vi.fn(),
    makeUsageProgressBar: vi.fn((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`)
}));

const mockGetUsageErrorMessage = getUsageErrorMessage as unknown as { mockReturnValue: (value: string) => void };

function render(widget: WeeklyUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyUsageWidget', () => {
    runUsagePercentWidgetSuite({
        baseItem: { id: 'weekly', type: 'weekly-usage' },
        createWidget: () => new WeeklyUsageWidget(),
        errorMessageMock: mockGetUsageErrorMessage,
        expectedModifierText: '(progress bar, inverted)',
        expectedProgress: 'Weekly: [bar:57.9:32] 57.9%',
        expectedRawProgress: '[bar:42.1:16] 42.1%',
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