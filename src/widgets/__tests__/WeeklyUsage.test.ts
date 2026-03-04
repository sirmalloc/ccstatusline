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
import { getUsageErrorMessage } from '../../utils/usage';
import { WeeklyUsageWidget } from '../WeeklyUsage';

vi.mock('../../utils/usage', () => ({
    getUsageErrorMessage: vi.fn(),
    makeUsageProgressBar: vi.fn((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`)
}));

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

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' }, { usageData: { weeklyUsage: 42.06 } })).toBe('Weekly: 42.1%');
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

        expect(render(widget, item, { usageData: { weeklyUsage: 42.06 } })).toBe('Weekly: [bar:57.9:32] 57.9%');
    });

    it('renders raw text mode without label', () => {
        const widget = new WeeklyUsageWidget();

        expect(render(widget, { id: 'weekly', type: 'weekly-usage', rawValue: true }, { usageData: { weeklyUsage: 42.06 } })).toBe('42.1%');
    });

    it('renders raw progress mode without label', () => {
        const widget = new WeeklyUsageWidget();
        const item: WidgetItem = {
            id: 'weekly',
            type: 'weekly-usage',
            rawValue: true,
            metadata: { display: 'progress-short' }
        };

        expect(render(widget, item, { usageData: { weeklyUsage: 42.06 } })).toBe('[bar:42.1:16] 42.1%');
    });

    it('shows usage error text when API call fails', () => {
        const widget = new WeeklyUsageWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'weekly', type: 'weekly-usage' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
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

    it('cycles display modes in the expected order', () => {
        const widget = new WeeklyUsageWidget();
        const base: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

        const first = widget.handleEditorAction('toggle-progress', base);
        const second = widget.handleEditorAction('toggle-progress', first ?? base);
        const third = widget.handleEditorAction('toggle-progress', second ?? base);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('time');
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = new WeeklyUsageWidget();
        const base: WidgetItem = { id: 'weekly', type: 'weekly-usage' };

        const inverted = widget.handleEditorAction('toggle-invert', base);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? base);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(base).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay({
            ...base,
            metadata: { display: 'progress', invert: 'true' }
        }).modifierText).toBe('(progress bar, inverted)');
    });
});