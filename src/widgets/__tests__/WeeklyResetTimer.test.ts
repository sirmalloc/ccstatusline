import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    formatUsageDuration,
    getUsageErrorMessage,
    resolveWeeklyUsageWindow
} from '../../utils/usage';
import { WeeklyResetTimerWidget } from '../WeeklyResetTimer';

vi.mock('../../utils/usage', () => ({
    formatUsageDuration: vi.fn(),
    getUsageErrorMessage: vi.fn(),
    resolveWeeklyUsageWindow: vi.fn()
}));

const mockFormatUsageDuration = formatUsageDuration as unknown as { mockReturnValue: (value: string) => void };
const mockGetUsageErrorMessage = getUsageErrorMessage as unknown as { mockReturnValue: (value: string) => void };
const mockResolveWeeklyUsageWindow = resolveWeeklyUsageWindow as unknown as { mockReturnValue: (value: unknown) => void };

function render(widget: WeeklyResetTimerWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyResetTimerWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('supports raw value and exposes progress/invert keybinds', () => {
        const widget = new WeeklyResetTimerWidget();

        expect(widget.getDisplayName()).toBe('Weekly Reset Timer');
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('renders preview using weekly reset format', () => {
        const widget = new WeeklyResetTimerWidget();

        expect(render(widget, { id: 'weekly-reset', type: 'weekly-reset-timer' }, { isPreview: true })).toBe('Weekly Reset: 36hr 30m');
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

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = new WeeklyResetTimerWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            id: 'weekly-reset',
            type: 'weekly-reset-timer',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });

    it('cycles display modes in the expected order', () => {
        const widget = new WeeklyResetTimerWidget();
        const base: WidgetItem = { id: 'weekly-reset', type: 'weekly-reset-timer' };

        const first = widget.handleEditorAction('toggle-progress', base);
        const second = widget.handleEditorAction('toggle-progress', first ?? base);
        const third = widget.handleEditorAction('toggle-progress', second ?? base);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('time');
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = new WeeklyResetTimerWidget();
        const base: WidgetItem = { id: 'weekly-reset', type: 'weekly-reset-timer' };

        const inverted = widget.handleEditorAction('toggle-invert', base);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? base);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(base).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay({
            ...base,
            metadata: { display: 'progress-short', invert: 'true' }
        }).modifierText).toBe('(short bar, inverted)');
    });
});