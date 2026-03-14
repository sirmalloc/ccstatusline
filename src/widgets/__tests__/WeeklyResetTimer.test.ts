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
import { WeeklyResetTimerWidget } from '../WeeklyResetTimer';

import { runUsageTimerEditorSuite } from './helpers/usage-widget-suites';

function render(widget: WeeklyResetTimerWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyResetTimerWidget', () => {
    let mockFormatUsageDuration: { mockReturnValue: (value: string) => void };
    let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };
    let mockResolveWeeklyUsageWindow: { mockReturnValue: (value: UsageWindowMetrics | null) => void };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFormatUsageDuration = vi.spyOn(usage, 'formatUsageDuration');
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
        mockResolveWeeklyUsageWindow = vi.spyOn(usage, 'resolveWeeklyUsageWindow');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders preview using weekly reset format', () => {
        const widget = new WeeklyResetTimerWidget();

        expect(render(widget, { id: 'weekly-reset', type: 'weekly-reset-timer' }, { isPreview: true })).toBe('Weekly Reset: 36hr 30m');
    });

    it('renders preview using days+hours format', () => {
        const widget = new WeeklyResetTimerWidget();
        const item: WidgetItem = {
            id: 'weekly-reset',
            type: 'weekly-reset-timer',
            metadata: { daysHours: 'true' }
        };

        expect(render(widget, item, { isPreview: true })).toBe('Weekly Reset: 1d 12hr');
    });

    it('renders remaining time in time mode', () => {
        const widget = new WeeklyResetTimerWidget();

        mockResolveWeeklyUsageWindow.mockReturnValue({
            sessionDurationMs: 604800000,
            elapsedMs: 120000000,
            remainingMs: 484800000,
            elapsedPercent: 19.8412698413,
            remainingPercent: 80.1587301587
        });
        mockFormatUsageDuration.mockReturnValue('134hr 40m');

        expect(render(widget, { id: 'weekly-reset', type: 'weekly-reset-timer' }, { usageData: {} })).toBe('Weekly Reset: 134hr 40m');
    });

    it('renders short progress bar with inverted fill', () => {
        const widget = new WeeklyResetTimerWidget();
        const item: WidgetItem = {
            id: 'weekly-reset',
            type: 'weekly-reset-timer',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        };

        mockResolveWeeklyUsageWindow.mockReturnValue({
            sessionDurationMs: 604800000,
            elapsedMs: 483840000,
            remainingMs: 120960000,
            elapsedPercent: 80,
            remainingPercent: 20
        });

        expect(render(widget, item, { usageData: {} })).toBe('Weekly Reset [███░░░░░░░░░░░░░] 20.0%');
    });

    it('returns usage error when no weekly reset data is available', () => {
        const widget = new WeeklyResetTimerWidget();

        mockResolveWeeklyUsageWindow.mockReturnValue(null);
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'weekly-reset', type: 'weekly-reset-timer' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    it('returns null when neither weekly reset data nor usage error exists', () => {
        const widget = new WeeklyResetTimerWidget();

        mockResolveWeeklyUsageWindow.mockReturnValue(null);

        expect(render(widget, { id: 'weekly-reset', type: 'weekly-reset-timer' }, { usageData: {} })).toBeNull();
    });

    it('renders remaining time in days+hours format', () => {
        const widget = new WeeklyResetTimerWidget();
        const item: WidgetItem = {
            id: 'weekly-reset',
            type: 'weekly-reset-timer',
            metadata: { daysHours: 'true' }
        };

        mockResolveWeeklyUsageWindow.mockReturnValue({
            sessionDurationMs: 604800000,
            elapsedMs: 120000000,
            remainingMs: 484800000,
            elapsedPercent: 19.8412698413,
            remainingPercent: 80.1587301587
        });

        expect(render(widget, item, { usageData: {} })).toBe('Weekly Reset: 5d 14hr');
    });

    it('shows raw value without label in time mode', () => {
        const widget = new WeeklyResetTimerWidget();

        mockResolveWeeklyUsageWindow.mockReturnValue({
            sessionDurationMs: 604800000,
            elapsedMs: 171900000,
            remainingMs: 432900000,
            elapsedPercent: 28.4216269841,
            remainingPercent: 71.5783730159
        });
        mockFormatUsageDuration.mockReturnValue('120hr 15m');

        expect(render(widget, { id: 'weekly-reset', type: 'weekly-reset-timer', rawValue: true }, { usageData: {} })).toBe('120hr 15m');
    });

    it('toggles days+hours metadata and shows modifier text', () => {
        const widget = new WeeklyResetTimerWidget();
        const baseItem: WidgetItem = { id: 'weekly-reset', type: 'weekly-reset-timer' };

        const toggled = widget.handleEditorAction('toggle-days-hours', baseItem);
        const cleared = widget.handleEditorAction('toggle-days-hours', toggled ?? baseItem);

        expect(toggled?.metadata?.daysHours).toBe('true');
        expect(cleared?.metadata?.daysHours).toBe('false');
        expect(widget.getEditorDisplay({ ...baseItem, metadata: { daysHours: 'true' } }).modifierText).toBe('(days+hours)');
    });

    runUsageTimerEditorSuite({
        baseItem: { id: 'weekly-reset', type: 'weekly-reset-timer' },
        createWidget: () => new WeeklyResetTimerWidget(),
        expectedDisplayName: 'Weekly Reset Timer',
        expectedKeybinds: [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' },
            { key: 's', label: '(s)hort time', action: 'toggle-compact' },
            { key: 'y', label: 'da(y)s+hours', action: 'toggle-days-hours' }
        ],
        expectedModifierText: '(short bar, inverted)',
        modifierItem: {
            id: 'weekly-reset',
            type: 'weekly-reset-timer',
            metadata: { display: 'progress-short', invert: 'true' }
        }
    });
});