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
import { BlockResetTimerWidget } from '../BlockResetTimer';

import { runUsageTimerEditorSuite } from './helpers/usage-widget-suites';

function render(widget: BlockResetTimerWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('BlockResetTimerWidget', () => {
    let mockFormatUsageDuration: { mockReturnValue: (value: string) => void };
    let mockFormatUsageResetAt: { mockReturnValue: (value: string | null) => void };
    let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };
    let mockResolveUsageWindowWithFallback: { mockReturnValue: (value: UsageWindowMetrics | null) => void };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFormatUsageDuration = vi.spyOn(usage, 'formatUsageDuration');
        mockFormatUsageResetAt = vi.spyOn(usage, 'formatUsageResetAt');
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
        mockResolveUsageWindowWithFallback = vi.spyOn(usage, 'resolveUsageWindowWithFallback');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders preview using block-style reset format', () => {
        const widget = new BlockResetTimerWidget();

        expect(render(widget, { id: 'reset', type: 'reset-timer' }, { isPreview: true })).toBe('Reset: 4hr 30m');
    });

    it('renders remaining time in time mode', () => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 3600000,
            remainingMs: 14400000,
            elapsedPercent: 20,
            remainingPercent: 80
        });
        mockFormatUsageDuration.mockReturnValue('4hr');

        expect(render(widget, { id: 'reset', type: 'reset-timer' }, { usageData: {} })).toBe('Reset: 4hr');
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

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 14400000,
            remainingMs: 3600000,
            elapsedPercent: 80,
            remainingPercent: 20
        });

        expect(render(widget, item, { usageData: {} })).toBe('Reset [███░░░░░░░░░░░░░] 20.0%');
    });

    it('rounds the progress bar fill to the nearest cell', () => {
        const widget = new BlockResetTimerWidget();
        const item: WidgetItem = {
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'progress-short' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 1800000,
            remainingMs: 16200000,
            elapsedPercent: 10,
            remainingPercent: 90
        });

        // 10% of 16 cells is 1.6, past the half-cell mark, so the 2nd cell fills.
        expect(render(widget, item, { usageData: {} })).toBe('Reset [██░░░░░░░░░░░░░░] 10.0%');
    });

    it('returns usage error when no timer data is available', () => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue(null);
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'reset', type: 'reset-timer' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    it('shows loading when neither timer data nor usage error exists', () => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue(null);

        expect(render(widget, { id: 'reset', type: 'reset-timer' }, { usageData: {} })).toBe('Reset: [Loading]');
        expect(render(widget, { id: 'reset', type: 'reset-timer', rawValue: true }, { usageData: {} })).toBe('[Loading]');
        expect(render(widget, { id: 'reset', type: 'reset-timer', metadata: { display: 'progress' } }, { usageData: {} })).toBe('Reset [Loading]');
    });

    it('declares the no-data and under-limit hideable states', () => {
        expect(new BlockResetTimerWidget().getHideableStates().map(state => state.key)).toEqual(['no-data', 'under-limit']);
    });

    // One state covers both placeholders, since either means the same thing to
    // a reader: the widget has nothing to report yet.
    it.each([
        ['a usage error', { error: 'timeout' as const }],
        ['no data at all', {}]
    ])('hides %s when the no-data state is enabled', (_label, usageData) => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue(null);
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'reset', type: 'reset-timer', metadata: { hide: 'no-data' } }, { usageData })).toBeNull();
    });

    it('keeps both placeholders when the no-data state is off', () => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue(null);
        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');

        expect(render(widget, { id: 'reset', type: 'reset-timer', metadata: { hide: '' } }, { usageData: {} })).toBe('Reset: [Loading]');
        expect(render(widget, { id: 'reset', type: 'reset-timer' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    describe('under-limit hide state', () => {
        const item: WidgetItem = { id: 'reset', type: 'reset-timer', metadata: { hide: 'under-limit' } };

        beforeEach(() => {
            mockResolveUsageWindowWithFallback.mockReturnValue({
                sessionDurationMs: 18000000,
                elapsedMs: 11820000,
                remainingMs: 6180000,
                elapsedPercent: 65.7,
                remainingPercent: 34.3
            });
            mockFormatUsageDuration.mockReturnValue('1hr 43m');
        });

        // The raw percent decides, so 99.7% that a whole-number usage percent shows as
        // "100%" still counts as under the limit.
        it.each([
            ['under 100%', { sessionUsage: 60 }],
            ['just under 100%', { sessionUsage: 99.7 }],
            ['unknown', {}],
            ['unknown with a usage error', { error: 'timeout' as const }]
        ])('hides the timer when the block\'s usage is %s', (_label, usageData) => {
            expect(render(new BlockResetTimerWidget(), item, { usageData })).toBeNull();
        });

        it.each([
            ['at 100%', 100],
            ['over 100%', 100.4]
        ])('shows the timer when the block\'s usage is %s', (_label, sessionUsage) => {
            expect(render(new BlockResetTimerWidget(), item, { usageData: { sessionUsage } })).toBe('Reset: 1hr 43m');
        });

        // The payload's percent comes from this session's last response, so the
        // usage API's decides when there is one
        it.each([
            ['the API reaches 100% while the payload lags', { sessionUsage: 97, apiSessionUsage: 100 }, 'Reset: 1hr 43m'],
            ['the API is under 100% after the payload reached it', { sessionUsage: 100, apiSessionUsage: 2 }, null]
        ])('reads the usage API\'s percent over the payload\'s when %s', (_label, usageData, expected) => {
            expect(render(new BlockResetTimerWidget(), item, { usageData })).toBe(expected);
        });

        it('keeps showing the timer under 100% when the state is off', () => {
            expect(render(new BlockResetTimerWidget(), { id: 'reset', type: 'reset-timer' }, { usageData: { sessionUsage: 60 } })).toBe('Reset: 1hr 43m');
        });

        it('keeps the preview sample', () => {
            const widget = new BlockResetTimerWidget();

            expect(render(widget, item, { isPreview: true })).toBe(render(widget, { id: 'reset', type: 'reset-timer' }, { isPreview: true }));
        });

        it('hides rather than loads at 100% with no reset window when no-data is also on', () => {
            mockResolveUsageWindowWithFallback.mockReturnValue(null);

            expect(render(new BlockResetTimerWidget(), { ...item, metadata: { hide: 'no-data,under-limit' } }, { usageData: { sessionUsage: 100 } })).toBeNull();
        });
    });

    it('shows raw value without label in time mode', () => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 4500000,
            remainingMs: 13500000,
            elapsedPercent: 25,
            remainingPercent: 75
        });
        mockFormatUsageDuration.mockReturnValue('3hr 45m');

        expect(render(widget, { id: 'reset', type: 'reset-timer', rawValue: true }, { usageData: {} })).toBe('3hr 45m');
    });

    it('shows reset timestamp in date mode', () => {
        const widget = new BlockResetTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 4500000,
            remainingMs: 13500000,
            elapsedPercent: 25,
            remainingPercent: 75
        });
        mockFormatUsageResetAt.mockReturnValue('2026-03-12 08:30 UTC');

        expect(render(widget,
            { id: 'reset', type: 'reset-timer', metadata: { absolute: 'true', timezone: 'Asia/Tokyo', locale: 'ja-JP', hour12: 'true' } },
            { usageData: { sessionResetAt: '2026-03-12T08:30:00.000Z' } }
        )).toBe('Reset: 2026-03-12 08:30 UTC');
        expect(mockFormatUsageResetAt).toHaveBeenCalledWith('2026-03-12T08:30:00.000Z', false, 'Asia/Tokyo', 'ja-JP', true);
    });

    it('shows configured timestamp settings in editor display only in timestamp mode', () => {
        const widget = new BlockResetTimerWidget();

        expect(widget.getEditorDisplay({
            id: 'reset',
            type: 'reset-timer',
            metadata: { timezone: 'America/New_York', locale: 'ja-JP', hour12: 'true' }
        }).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay({
            id: 'reset',
            type: 'reset-timer',
            metadata: { absolute: 'true', timezone: 'America/New_York', locale: 'ja-JP', hour12: 'true' }
        }).modifierText).toBe('(date, 12hr, tz: America/New_York, locale: ja-JP)');
    });

    it('shows timestamp keybinds only in timestamp mode', () => {
        const widget = new BlockResetTimerWidget();

        expect(widget.getCustomKeybinds({
            id: 'reset',
            type: 'reset-timer',
            metadata: { absolute: 'true' }
        })).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 's', label: '(s)hort time', action: 'toggle-compact' },
            { key: 't', label: '(t)imestamp', action: 'toggle-date' },
            { key: 'f', label: '12/24 (f)ormat', action: 'toggle-hour-format' },
            { key: 'z', label: 'time(z)one', action: 'edit-timezone' },
            { key: 'l', label: '(l)ocale', action: 'edit-locale' }
        ]);
    });

    it('toggles hour format metadata', () => {
        const widget = new BlockResetTimerWidget();
        const baseItem: WidgetItem = {
            id: 'reset',
            type: 'reset-timer',
            metadata: { absolute: 'true' }
        };

        const hour12 = widget.handleEditorAction('toggle-hour-format', baseItem);
        const cleared = widget.handleEditorAction('toggle-hour-format', hour12 ?? baseItem);

        expect(hour12?.metadata?.hour12).toBe('true');
        expect(cleared?.metadata?.hour12).toBe('false');
    });

    it('renders slider bar with elapsed percentage', () => {
        const widget = new BlockResetTimerWidget();
        const item: WidgetItem = {
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'slider' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 9000000,
            remainingMs: 9000000,
            elapsedPercent: 50,
            remainingPercent: 50
        });

        expect(render(widget, item, { usageData: {} })).toBe('Reset ▓▓▓▓▓░░░░░ 50.0%');
    });

    it('renders slider-only bar without percentage', () => {
        const widget = new BlockResetTimerWidget();
        const item: WidgetItem = {
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'slider-only' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 9000000,
            remainingMs: 9000000,
            elapsedPercent: 50,
            remainingPercent: 50
        });

        expect(render(widget, item, { usageData: {} })).toBe('Reset ▓▓▓▓▓░░░░░');
    });

    it('renders inverted slider using remaining percent', () => {
        const widget = new BlockResetTimerWidget();
        const item: WidgetItem = {
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'slider', invert: 'true' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 14400000,
            remainingMs: 3600000,
            elapsedPercent: 80,
            remainingPercent: 20
        });

        expect(render(widget, item, { usageData: {} })).toBe('Reset ▓▓░░░░░░░░ 20.0%');
    });

    it('exposes invert keybind in slider mode', () => {
        const widget = new BlockResetTimerWidget();

        expect(widget.getCustomKeybinds({
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'slider' }
        })).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('shows short bar modifier text in slider modes', () => {
        const widget = new BlockResetTimerWidget();

        expect(widget.getEditorDisplay({
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'slider' }
        }).modifierText).toBe('(short bar)');
        expect(widget.getEditorDisplay({
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'slider-only' }
        }).modifierText).toBe('(short bar only)');
    });

    it('does not show a time cursor carried over from a usage widget', () => {
        // A usage bar's cursor metadata survives a type change in the picker,
        // but this timer never draws a cursor
        const widget = new BlockResetTimerWidget();

        const modifierText = widget.getEditorDisplay({
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'progress', cursor: 'true' }
        }).modifierText;

        expect(modifierText).toContain('bar');
        expect(modifierText).not.toContain('time cursor');
    });

    runUsageTimerEditorSuite({
        baseItem: { id: 'reset', type: 'reset-timer' },
        createWidget: () => new BlockResetTimerWidget(),
        expectedDisplayName: 'Block Reset Timer',
        expectedTimeKeybinds: [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 's', label: '(s)hort time', action: 'toggle-compact' },
            { key: 't', label: '(t)imestamp', action: 'toggle-date' }
        ],
        supportsDateMode: true,
        supportsSliderMode: true,
        expectedModifierText: '(medium bar, inverted)',
        expectedProgressKeybinds: [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ],
        modifierItem: {
            id: 'reset',
            type: 'reset-timer',
            metadata: { display: 'progress-short', invert: 'true' }
        }
    });
});
