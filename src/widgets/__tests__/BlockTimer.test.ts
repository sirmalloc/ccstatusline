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
import { BlockTimerWidget } from '../BlockTimer';

import { runUsageTimerEditorSuite } from './helpers/usage-widget-suites';

function render(widget: BlockTimerWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('BlockTimerWidget', () => {
    let mockFormatUsageDuration: { mockReturnValue: (value: string) => void };
    let mockResolveUsageWindowWithFallback: { mockReturnValue: (value: UsageWindowMetrics | null) => void };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFormatUsageDuration = vi.spyOn(usage, 'formatUsageDuration');
        mockResolveUsageWindowWithFallback = vi.spyOn(usage, 'resolveUsageWindowWithFallback');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders elapsed time in time mode', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = { id: 'block', type: 'block-timer' };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 13500000,
            remainingMs: 4500000,
            elapsedPercent: 75,
            remainingPercent: 25
        });
        mockFormatUsageDuration.mockReturnValue('3hr 45m');

        expect(render(widget, item, { usageData: {} })).toBe('Block: 3hr 45m');
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

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 13500000,
            remainingMs: 4500000,
            elapsedPercent: 75,
            remainingPercent: 25
        });

        expect(render(widget, item, { usageData: {} })).toBe('Block [████░░░░░░░░░░░░] 25.0%');
    });

    it('renders empty values when no usage or fallback data exists', () => {
        const widget = new BlockTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue(null);

        expect(render(widget, { id: 'block', type: 'block-timer' }, { usageData: { error: 'timeout' } })).toBe('Block: 0hr 0m');
        expect(render(widget, {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'progress' }
        }, { usageData: { error: 'timeout' } })).toBe(`Block [${'░'.repeat(32)}] 0.0%`);
    });

    it('shows raw value without label in time mode', () => {
        const widget = new BlockTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 7200000,
            remainingMs: 10800000,
            elapsedPercent: 40,
            remainingPercent: 60
        });
        mockFormatUsageDuration.mockReturnValue('2hr');

        expect(render(widget, { id: 'block', type: 'block-timer', rawValue: true }, { usageData: {} })).toBe('2hr');
    });

    it('renders slider bar with elapsed percentage', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 9000000,
            remainingMs: 9000000,
            elapsedPercent: 50,
            remainingPercent: 50
        });

        expect(render(widget, item, { usageData: {} })).toBe('Block ▓▓▓▓▓░░░░░ 50.0%');
    });

    it('renders slider-only bar without percentage', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider-only' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 9000000,
            remainingMs: 9000000,
            elapsedPercent: 50,
            remainingPercent: 50
        });

        expect(render(widget, item, { usageData: {} })).toBe('Block ▓▓▓▓▓░░░░░');
    });

    it('renders inverted slider using remaining percent', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider', invert: 'true' }
        };

        mockResolveUsageWindowWithFallback.mockReturnValue({
            sessionDurationMs: 18000000,
            elapsedMs: 14400000,
            remainingMs: 3600000,
            elapsedPercent: 80,
            remainingPercent: 20
        });

        expect(render(widget, item, { usageData: {} })).toBe('Block ▓▓░░░░░░░░ 20.0%');
    });

    it('renders empty slider when no usage or fallback data exists', () => {
        const widget = new BlockTimerWidget();

        mockResolveUsageWindowWithFallback.mockReturnValue(null);

        expect(render(widget, {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider' }
        }, { usageData: { error: 'timeout' } })).toBe('Block ░░░░░░░░░░ 0.0%');
        expect(render(widget, {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider-only' }
        }, { usageData: { error: 'timeout' } })).toBe('Block ░░░░░░░░░░');
    });

    it('exposes invert keybind in slider mode', () => {
        const widget = new BlockTimerWidget();

        expect(widget.getCustomKeybinds({
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider' }
        })).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ]);
    });

    it('shows short bar modifier text in slider modes', () => {
        const widget = new BlockTimerWidget();

        expect(widget.getEditorDisplay({
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider' }
        }).modifierText).toBe('(short bar)');
        expect(widget.getEditorDisplay({
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'slider-only' }
        }).modifierText).toBe('(short bar only)');
    });

    runUsageTimerEditorSuite({
        baseItem: { id: 'block', type: 'block-timer' },
        createWidget: () => new BlockTimerWidget(),
        expectedDisplayName: 'Block Timer',
        supportsSliderMode: true,
        expectedModifierText: '(long bar, inverted)',
        modifierItem: {
            id: 'block',
            type: 'block-timer',
            metadata: { display: 'progress', invert: 'true' }
        }
    });
});
