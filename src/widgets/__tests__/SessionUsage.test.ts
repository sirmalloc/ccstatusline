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
import * as usage from '../../utils/usage';
import { SessionUsageWidget } from '../SessionUsage';

function render(widget: SessionUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(usage, 'formatUsageDuration').mockImplementation((ms: number) => {
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            if (minutes === 0)
                return `${hours}hr`;
            return `${hours}hr ${minutes}m`;
        });
        vi.spyOn(usage, 'getUsageErrorMessage').mockImplementation((error: string) => {
            switch (error) {
                case 'no-credentials': return '[No credentials]';
                case 'timeout': return '[Timeout]';
                case 'api-error': return '[API Error]';
                case 'parse-error': return '[Parse Error]';
                default: return `[${error}]`;
            }
        });
        vi.spyOn(usage, 'makeUsageProgressBar').mockImplementation((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`);
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

        expect(render(widget, item, { usageData: { sessionUsage: 23.45 }, terminalWidth: 160 })).toBe('Session: [bar:76.5:16] 76.5%');
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

        expect(render(widget, item, { usageData: { sessionUsage: 23.45 }, terminalWidth: 160 })).toBe('[bar:23.4:32] 23.4%');
    });

    it('shows usage error text when no data and no stdin fallback', () => {
        const widget = new SessionUsageWidget();

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

    it('falls back to stdin rate_limits when usageData has no session data', () => {
        const widget = new SessionUsageWidget();

        const context: RenderContext = {
            usageData: {},
            data: { rate_limits: { five_hour: { used_percentage: 59.0, resets_at: null } } }
        };

        expect(render(widget, { id: 'session', type: 'session-usage' }, context)).toBe('Session: 59.0%');
    });

    it('falls back to stdin rate_limits when usageData has error', () => {
        const widget = new SessionUsageWidget();

        const context: RenderContext = {
            usageData: { error: 'no-credentials' },
            data: { rate_limits: { five_hour: { used_percentage: 42.5, resets_at: null } } }
        };

        expect(render(widget, { id: 'session', type: 'session-usage' }, context)).toBe('Session: 42.5%');
    });

    it('shows reset timer from stdin data in wide progress mode', () => {
        const widget = new SessionUsageWidget();

        const futureEpoch = Math.floor(Date.now() / 1000) + 8100; // ~2hr 15m from now
        const context: RenderContext = {
            usageData: {},
            terminalWidth: 160,
            data: { rate_limits: { five_hour: { used_percentage: 59.0, resets_at: futureEpoch } } }
        };

        const result = render(widget, {
            id: 'session',
            type: 'session-usage',
            metadata: { display: 'progress-short' }
        }, context);

        expect(result).toContain('Session:');
        expect(result).toContain('59.0%');
        expect(result).toContain('(resets');
    });

    it('returns null when both usageData and stdin have no data', () => {
        const widget = new SessionUsageWidget();

        expect(render(widget, { id: 'session', type: 'session-usage' }, { usageData: {} })).toBeNull();
    });

    it('shows error when no stdin fallback available', () => {
        const widget = new SessionUsageWidget();

        expect(render(widget, { id: 'session', type: 'session-usage' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });
});