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
    resolveUsageWindowWithFallback
} from '../../utils/usage';
import { BlockTimerWidget } from '../BlockTimer';

vi.mock('../../utils/usage', () => ({
    fetchUsageData: vi.fn(),
    formatUsageDuration: vi.fn(),
    resolveUsageWindowWithFallback: vi.fn()
}));

const mockFetchUsageData = fetchUsageData as unknown as { mockReturnValue: (value: unknown) => void };
const mockFormatUsageDuration = formatUsageDuration as unknown as { mockReturnValue: (value: string) => void };
const mockResolveUsageWindowWithFallback = resolveUsageWindowWithFallback as unknown as { mockReturnValue: (value: unknown) => void };

function render(widget: BlockTimerWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('BlockTimerWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('supports raw value and exposes progress/invert keybinds', () => {
        const widget = new BlockTimerWidget();

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('renders elapsed time in time mode', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = { id: 'block', type: 'block-timer' };

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 13500000,
            remainingMs: 4500000,
            elapsedPercent: 75,
            remainingPercent: 25
        });
        mockFormatUsageDuration.mockReturnValue('3hr 45m');

        expect(render(widget, item)).toBe('Block: 3hr 45m');
    });

    it('renders short progress bar with inverted fill', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = {
            id: 'block',
            type: 'block-timer',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        };

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 13500000,
            remainingMs: 4500000,
            elapsedPercent: 75,
            remainingPercent: 25
        });

        expect(render(widget, item)).toBe('Block [████░░░░░░░░░░░░] 25.0%');
    });

    it('renders empty values when no usage or fallback data exists', () => {
        const widget = new BlockTimerWidget();

        mockFetchUsageData.mockReturnValue({ error: 'timeout' });
        mockResolveUsageWindowWithFallback.mockReturnValue(null);

        expect(render(widget, { id: 'block', type: 'block-timer' })).toBe('Block: 0hr 0m');
        expect(render(widget, {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'progress' }
        })).toBe(`Block [${'░'.repeat(32)}] 0.0%`);
    });

    it('shows raw value without label in time mode', () => {
        const widget = new BlockTimerWidget();

        mockFetchUsageData.mockReturnValue({});
        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 7200000,
            remainingMs: 10800000,
            elapsedPercent: 40,
            remainingPercent: 60
        });
        mockFormatUsageDuration.mockReturnValue('2hr');

        expect(render(widget, { id: 'block', type: 'block-timer', rawValue: true })).toBe('2hr');
    });

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = new BlockTimerWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            id: 'block',
            type: 'block-timer',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });
});