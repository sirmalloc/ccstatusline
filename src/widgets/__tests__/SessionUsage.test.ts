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
import { SessionUsageWidget } from '../SessionUsage';

import { runUsagePercentWidgetSuite } from './helpers/usage-widget-suites';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };
const usageErrorMessageMock = {
    mockReturnValue(value: string): void {
        mockGetUsageErrorMessage.mockReturnValue(value);
    }
};

function render(widget: SessionUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
        vi.spyOn(usage, 'makeUsageProgressBar').mockImplementation((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    runUsagePercentWidgetSuite({
        baseItem: { id: 'session', type: 'session-usage' },
        createWidget: () => new SessionUsageWidget(),
        errorMessageMock: usageErrorMessageMock,
        expectedModifierText: '(short bar, inverted)',
        expectedProgress: 'Session: [bar:76.5:16] 76.5%',
        expectedRawProgress: '[bar:23.4:32] 23.4%',
        expectedRawTime: '23.4%',
        expectedTime: 'Session: 23.4%',
        modifierItem: {
            id: 'session',
            type: 'session-usage',
            metadata: { display: 'progress-short', invert: 'true' }
        },
        progressItem: {
            id: 'session',
            type: 'session-usage',
            metadata: { display: 'progress-short', invert: 'true' }
        },
        rawProgressItem: {
            id: 'session',
            type: 'session-usage',
            rawValue: true,
            metadata: { display: 'progress' }
        },
        rawTimeItem: {
            id: 'session',
            type: 'session-usage',
            rawValue: true
        },
        render,
        usageField: 'sessionUsage',
        usageValue: 23.45
    });

    describe('getValue', () => {
        it('returns number value type', () => {
            const widget = new SessionUsageWidget();
            expect(widget.getValueType()).toBe('number');
        });

        it('returns percentage from usageData.sessionUsage', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { sessionUsage: 42.5 }
            };
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(42.5);
        });

        it('clamps percentage to 0-100 range for values below 0', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { sessionUsage: -10 }
            };
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(0);
        });

        it('clamps percentage to 0-100 range for values above 100', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { sessionUsage: 150 }
            };
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(100);
        });

        it('returns preview percentage in preview mode', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(20);
        });

        it('returns null when usageData is missing', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('returns null when sessionUsage is undefined', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { weeklyUsage: 50 }
            };
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('returns null when usageData has error', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { error: 'timeout' }
            };
            const item: WidgetItem = { id: 'session', type: 'session-usage' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('ignores invert metadata - returns actual percentage', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { sessionUsage: 30 }
            };
            const item: WidgetItem = {
                id: 'session',
                type: 'session-usage',
                metadata: { invert: 'true' }
            };

            expect(widget.getValue(context, item)).toBe(30);
        });

        it('ignores display mode - returns percentage not progress bar', () => {
            const widget = new SessionUsageWidget();
            const context: RenderContext = {
                usageData: { sessionUsage: 45 }
            };
            const item: WidgetItem = {
                id: 'session',
                type: 'session-usage',
                metadata: { display: 'progress' }
            };

            expect(widget.getValue(context, item)).toBe(45);
        });
    });
});