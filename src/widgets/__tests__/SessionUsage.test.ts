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
import { SessionUsageWidget } from '../SessionUsage';

vi.mock('../../utils/usage', () => ({
    getUsageErrorMessage: vi.fn(),
    makeUsageProgressBar: vi.fn((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`)
}));

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
        expect(render(widget, { id: 'session', type: 'session-usage' }, { usageData: { sessionUsage: 23.45 } })).toBe('Session: 23.4%');
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

        expect(render(widget, item, { usageData: { sessionUsage: 23.45 } })).toBe('Session: [bar:76.5:16] 76.5%');
    });

    it('renders raw text mode without label', () => {
        const widget = new SessionUsageWidget();

        expect(render(widget, { id: 'session', type: 'session-usage', rawValue: true }, { usageData: { sessionUsage: 23.45 } })).toBe('23.4%');
    });

    it('renders raw progress mode without label', () => {
        const widget = new SessionUsageWidget();
        const item: WidgetItem = {
            id: 'session',
            type: 'session-usage',
            rawValue: true,
            metadata: { display: 'progress' }
        };

        expect(render(widget, item, { usageData: { sessionUsage: 23.45 } })).toBe('[bar:23.4:32] 23.4%');
    });

    it('shows usage error text when API call fails', () => {
        const widget = new SessionUsageWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'session', type: 'session-usage' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
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

    it('cycles display modes in the expected order', () => {
        const widget = new SessionUsageWidget();
        const base: WidgetItem = { id: 'session', type: 'session-usage' };

        const first = widget.handleEditorAction('toggle-progress', base);
        const second = widget.handleEditorAction('toggle-progress', first ?? base);
        const third = widget.handleEditorAction('toggle-progress', second ?? base);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('time');
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = new SessionUsageWidget();
        const base: WidgetItem = { id: 'session', type: 'session-usage' };

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