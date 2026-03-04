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
    fetchUsageData,
    formatUsageDuration,
    getUsageErrorMessage,
    resolveUsageWindowWithFallback
} from '../../utils/usage';
import { BlockResetTimerWidget } from '../BlockResetTimer';

vi.mock('../../utils/usage', () => ({
    fetchUsageData: vi.fn(),
    formatUsageDuration: vi.fn(),
    getUsageErrorMessage: vi.fn(),
    resolveUsageWindowWithFallback: vi.fn()
}));

const mockFetchUsageData = fetchUsageData as unknown as { mockReturnValue: (value: unknown) => void };
const mockFormatUsageDuration = formatUsageDuration as unknown as { mockReturnValue: (value: string) => void };
const mockGetUsageErrorMessage = getUsageErrorMessage as unknown as { mockReturnValue: (value: string) => void };
const mockResolveUsageWindowWithFallback = resolveUsageWindowWithFallback as unknown as { mockReturnValue: (value: unknown) => void };

function render(widget: BlockResetTimerWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('BlockResetTimerWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('supports raw value and exposes progress/invert keybinds', () => {
        const widget = new BlockResetTimerWidget();

        expect(widget.getDisplayName()).toBe('Block Reset Timer');
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('renders preview using block-style reset format', () => {
        const widget = new BlockResetTimerWidget();

        expect(render(widget, { id: 'reset', type: 'reset-timer' }, { isPreview: true })).toBe('Reset: 4hr 30m');
    });

    it('renders remaining time in time mode', () => {
        const widget = new BlockResetTimerWidget();

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 3600000,
            remainingMs: 14400000,
            elapsedPercent: 20,
            remainingPercent: 80
        });
        mockFormatUsageDuration.mockReturnValue('4hr');

        expect(render(widget, { id: 'reset', type: 'reset-timer' })).toBe('Reset: 4hr');
    });

    it('renders short progress bar with inverted fill', () => {
        const widget = new BlockResetTimerWidget();
        const item: WidgetItem = {
            id: 'reset',
            type: 'reset-timer',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        };

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 14400000,
            remainingMs: 3600000,
            elapsedPercent: 80,
            remainingPercent: 20
        });

        expect(render(widget, item)).toBe('Reset [███░░░░░░░░░░░░░] 20.0%');
    });

    it('returns usage error when no timer data is available', () => {
        const widget = new BlockResetTimerWidget();

        mockFetchUsageData.mockReturnValue({ error: 'timeout' });
        mockResolveUsageWindowWithFallback.mockReturnValue(null);
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'reset', type: 'reset-timer' })).toBe('[Timeout]');
    });

    it('returns null when neither timer data nor usage error exists', () => {
        const widget = new BlockResetTimerWidget();

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue(null);

        expect(render(widget, { id: 'reset', type: 'reset-timer' })).toBeNull();
    });

    it('shows raw value without label in time mode', () => {
        const widget = new BlockResetTimerWidget();

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 4500000,
            remainingMs: 13500000,
            elapsedPercent: 25,
            remainingPercent: 75
        });
        mockFormatUsageDuration.mockReturnValue('3hr 45m');

        expect(render(widget, { id: 'reset', type: 'reset-timer', rawValue: true })).toBe('3hr 45m');
    });

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = new BlockResetTimerWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            id: 'reset',
            type: 'reset-timer',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });

    it('cycles display modes in the expected order', () => {
        const widget = new BlockResetTimerWidget();
        const base: WidgetItem = { id: 'reset', type: 'reset-timer' };

        const first = widget.handleEditorAction('toggle-progress', base);
        const second = widget.handleEditorAction('toggle-progress', first ?? base);
        const third = widget.handleEditorAction('toggle-progress', second ?? base);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('time');
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = new BlockResetTimerWidget();
        const base: WidgetItem = { id: 'reset', type: 'reset-timer' };

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