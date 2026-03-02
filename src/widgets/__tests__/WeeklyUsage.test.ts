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
});