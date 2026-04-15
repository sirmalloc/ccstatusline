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
import { WeeklyUsageWidget } from '../WeeklyUsage';

import { runUsagePercentWidgetSuite } from './helpers/usage-widget-suites';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };
const usageErrorMessageMock = {
    mockReturnValue(value: string): void {
        mockGetUsageErrorMessage.mockReturnValue(value);
    }
};

function render(widget: WeeklyUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
        vi.spyOn(usage, 'makeUsageProgressBar').mockImplementation((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    runUsagePercentWidgetSuite({
        baseItem: { id: 'weekly', type: 'weekly-usage' },
        createWidget: () => new WeeklyUsageWidget(),
        errorMessageMock: usageErrorMessageMock,
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

    describe('getValue', () => {
        it('returns number value type', () => {
            const widget = new WeeklyUsageWidget();
            expect(widget.getValueType()).toBe('number');
        });

        it('returns percentage from usageData.weeklyUsage', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { weeklyUsage: 35.7 }
            };
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(35.7);
        });

        it('clamps percentage to 0-100 range for values below 0', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { weeklyUsage: -5 }
            };
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(0);
        });

        it('clamps percentage to 0-100 range for values above 100', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { weeklyUsage: 120 }
            };
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(100);
        });

        it('returns preview percentage in preview mode', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(12);
        });

        it('returns null when usageData is missing', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('returns null when weeklyUsage is undefined', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { sessionUsage: 50 }
            };
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('returns null when usageData has error', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { error: 'timeout' }
            };
            const item: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('ignores invert metadata - returns actual percentage', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { weeklyUsage: 25 }
            };
            const item: WidgetItem = {
                id: 'weekly',
                type: 'weekly-usage',
                metadata: { invert: 'true' }
            };

            expect(widget.getValue(context, item)).toBe(25);
        });

        it('ignores display mode - returns percentage not progress bar', () => {
            const widget = new WeeklyUsageWidget();
            const context: RenderContext = {
                usageData: { weeklyUsage: 60 }
            };
            const item: WidgetItem = {
                id: 'weekly',
                type: 'weekly-usage',
                metadata: { display: 'progress' }
            };

            expect(widget.getValue(context, item)).toBe(60);
        });
    });
});