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
    getUsageErrorMessage
} from '../../utils/usage';
import { WeeklyUsageWidget } from '../WeeklyUsage';

vi.mock('../../utils/usage', () => ({
    fetchUsageData: vi.fn(),
    formatUsageDuration: vi.fn((ms: number) => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (minutes === 0) return `${hours}hr`;
        return `${hours}hr ${minutes}m`;
    }),
    getUsageErrorMessage: vi.fn(),
    makeUsageProgressBar: vi.fn((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`)
}));

const mockFetchUsageData = fetchUsageData as unknown as { mockReturnValue: (value: unknown) => void };
const mockGetUsageErrorMessage = getUsageErrorMessage as unknown as { mockReturnValue: (value: string) => void };

function render(widget: WeeklyUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyUsageWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exposes progress and invert keybinds', () => {
        const widget = new WeeklyUsageWidget();

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('renders percentage text in time mode', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({ weeklyUsage: 42.06 });

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' })).toBe('Weekly: 42.1%');
    });

    it('renders full inverted progress mode', () => {
        const widget = new WeeklyUsageWidget();
        const item: WidgetItem = {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: {
                display: 'progress',
                invert: 'true'
            }
        };

        mockFetchUsageData.mockReturnValue({ weeklyUsage: 42.06 });

        expect(render(widget, item)).toBe('Weekly: [bar:57.9:32] 57.9%');
    });

    it('renders raw text mode without label', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({ weeklyUsage: 42.06 });

        expect(render(widget, { id: 'weekly', type: 'weekly-usage', rawValue: true })).toBe('42.1%');
    });

    it('renders raw progress mode without label', () => {
        const widget = new WeeklyUsageWidget();
        const item: WidgetItem = {
            id: 'weekly',
            type: 'weekly-usage',
            rawValue: true,
            metadata: { display: 'progress-short' }
        };

        mockFetchUsageData.mockReturnValue({ weeklyUsage: 42.06 });

        expect(render(widget, item)).toBe('[bar:42.1:16] 42.1%');
    });

    it('shows usage error text when API call fails', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({ error: 'timeout' });
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' })).toBe('[Timeout]');
    });

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = new WeeklyUsageWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });

    it('falls back to stdin rate_limits when API returns no data', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({});

        const context: RenderContext = {
            data: {
                rate_limits: {
                    seven_day: { used_percentage: 12.0, resets_at: null }
                }
            }
        };

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' }, context)).toBe('Weekly: 12.0%');
    });

    it('falls back to stdin rate_limits when API returns error', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({ error: 'no-credentials' });

        const context: RenderContext = {
            data: {
                rate_limits: {
                    seven_day: { used_percentage: 25.3, resets_at: null }
                }
            }
        };

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' }, context)).toBe('Weekly: 25.3%');
    });

    it('shows reset timer from stdin data in wide progress mode', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({});

        const futureEpoch = Math.floor(Date.now() / 1000) + 259200; // ~3 days from now
        const context: RenderContext = {
            terminalWidth: 160,
            data: {
                rate_limits: {
                    seven_day: { used_percentage: 12.0, resets_at: futureEpoch }
                }
            }
        };

        const result = render(widget, {
            id: 'weekly',
            type: 'weekly-usage',
            metadata: { display: 'progress-short' }
        }, context);

        expect(result).toContain('Weekly:');
        expect(result).toContain('12.0%');
        expect(result).toContain('(resets');
    });

    it('returns null when both API and stdin have no data', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({});

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' }, {})).toBeNull();
    });

    it('shows API error when no stdin fallback available', () => {
        const widget = new WeeklyUsageWidget();

        mockFetchUsageData.mockReturnValue({ error: 'timeout' });
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' }, {})).toBe('[Timeout]');
    });
});