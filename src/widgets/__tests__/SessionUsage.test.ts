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
import { SessionUsageWidget } from '../SessionUsage';

vi.mock('../../utils/usage', () => ({
    fetchUsageData: vi.fn(),
    getUsageErrorMessage: vi.fn(),
    makeUsageProgressBar: vi.fn((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`)
}));

const mockFetchUsageData = fetchUsageData as unknown as { mockReturnValue: (value: unknown) => void };
const mockGetUsageErrorMessage = getUsageErrorMessage as unknown as { mockReturnValue: (value: string) => void };

function render(widget: SessionUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionUsageWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exposes progress and invert keybinds', () => {
        const widget = new SessionUsageWidget();

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('renders percentage text in time mode', () => {
        const widget = new SessionUsageWidget();

        mockFetchUsageData.mockReturnValue({ sessionUsage: 23.45 });

        expect(render(widget, { id: 'session', type: 'session-usage' })).toBe('Session: 23.4%');
    });

    it('renders short inverted progress mode', () => {
        const widget = new SessionUsageWidget();
        const item: WidgetItem = {
            id: 'session',
            type: 'session-usage',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        };

        mockFetchUsageData.mockReturnValue({ sessionUsage: 23.45 });

        expect(render(widget, item)).toBe('Session: [bar:76.5:16] 76.5%');
    });

    it('renders raw text mode without label', () => {
        const widget = new SessionUsageWidget();

        mockFetchUsageData.mockReturnValue({ sessionUsage: 23.45 });

        expect(render(widget, { id: 'session', type: 'session-usage', rawValue: true })).toBe('23.4%');
    });

    it('renders raw progress mode without label', () => {
        const widget = new SessionUsageWidget();
        const item: WidgetItem = {
            id: 'session',
            type: 'session-usage',
            rawValue: true,
            metadata: { display: 'progress' }
        };

        mockFetchUsageData.mockReturnValue({ sessionUsage: 23.45 });

        expect(render(widget, item)).toBe('[bar:23.4:32] 23.4%');
    });

    it('shows usage error text when API call fails', () => {
        const widget = new SessionUsageWidget();

        mockFetchUsageData.mockReturnValue({ error: 'timeout' });
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'session', type: 'session-usage' })).toBe('[Timeout]');
    });

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = new SessionUsageWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            id: 'session',
            type: 'session-usage',
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });
});