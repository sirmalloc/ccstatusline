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
import * as claudeSettings from '../../utils/claude-settings';
import { BlockResetTimerWidget } from '../BlockResetTimer';
import { BlockTimerWidget } from '../BlockTimer';
import { ContextBarWidget } from '../ContextBar';
import { ContextPercentageWidget } from '../ContextPercentage';
import { ContextPercentageUsableWidget } from '../ContextPercentageUsable';
import { ExtraUsageUtilizationWidget } from '../ExtraUsageUtilization';
import { FableWeeklyUsageWidget } from '../FableWeeklyUsage';
import { SessionUsageWidget } from '../SessionUsage';
import { SpendLimitUsageWidget } from '../SpendLimitUsage';
import { WeeklyOpusUsageWidget } from '../WeeklyOpusUsage';
import { WeeklyResetTimerWidget } from '../WeeklyResetTimer';
import { WeeklySonnetUsageWidget } from '../WeeklySonnetUsage';
import { WeeklyUsageWidget } from '../WeeklyUsage';

const NOW = Date.parse('2026-04-01T12:00:00Z');
const context: RenderContext = {
    data: {
        context_window: {
            context_window_size: 200000,
            current_usage: {
                input_tokens: 40000,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0
            }
        }
    },
    usageData: {
        sessionUsage: 25,
        weeklyUsage: 25,
        weeklySonnetUsage: 25,
        weeklyOpusUsage: 25,
        fableUsage: 25,
        spendLimitUsage: 25,
        extraUsageEnabled: true,
        extraUsageUtilization: 25,
        sessionResetAt: new Date(NOW + 0.75 * 5 * 3600000).toISOString(),
        weeklyResetAt: new Date(NOW + 0.75 * 7 * 24 * 3600000).toISOString()
    }
};

const cases = [
    { widget: new SessionUsageWidget(), type: 'session-usage', label: '5h: ', preview: '━━━━━━━━━━━━━━── 90.0%', cursor: true },
    { widget: new WeeklyUsageWidget(), type: 'weekly-usage', label: 'Weekly: ', preview: '━━━━━━━━━━━━━─── 80.0%', cursor: true },
    { widget: new WeeklySonnetUsageWidget(), type: 'weekly-sonnet-usage', label: 'Weekly Sonnet: ', preview: '━━━━━━━━━━━───── 70.0%', cursor: true },
    { widget: new WeeklyOpusUsageWidget(), type: 'weekly-opus-usage', label: 'Weekly Opus: ', preview: '━━━━━━━━━━────── 60.0%', cursor: true },
    { widget: new FableWeeklyUsageWidget(), type: 'fable-weekly-usage', label: 'Weekly Fable: ', preview: '━━━━━━━━━━────── 60.0%', cursor: true },
    { widget: new SpendLimitUsageWidget(), type: 'spend-limit-usage', label: 'Spend Limit: ', preview: '━━━━━━────────── 40.0%', cursor: false },
    { widget: new ExtraUsageUtilizationWidget(), type: 'extra-usage-utilization', label: 'Overage: ', preview: '━━━━━━━━━━━━━━── 85.0%', cursor: false },
    { widget: new BlockTimerWidget(), type: 'block-timer', label: 'Block ', preview: '━━━━━━━━━━━━──── 73.9%', cursor: false },
    { widget: new BlockResetTimerWidget(), type: 'reset-timer', label: 'Reset ', preview: '━━━━━━━━━━━━━━── 85.0%', cursor: false },
    { widget: new WeeklyResetTimerWidget(), type: 'weekly-reset-timer', label: 'Weekly Reset ', preview: '━━━━━━━━━━━━━─── 78.3%', cursor: false }
];

describe('line bars across usage and timer widgets', () => {
    beforeEach(() => {
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
    });
    afterEach(() => vi.restoreAllMocks());

    for (const { widget, type, label, preview, cursor } of cases) {
        describe(type, () => {
            const item: WidgetItem = { id: type, type, metadata: { display: 'line' } };

            it('renders live usage and its preview as an unbracketed 16-cell line', () => {
                expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe(`${label}━━━━──────────── 25.0%`);
                expect(widget.render(item, { isPreview: true }, DEFAULT_SETTINGS)).toBe(label + preview);
                expect(widget.getEditorDisplay(item).modifierText).toContain('line bar');
            });

            it('preserves fill inversion, label overrides, raw values, and number formatting', () => {
                const inverted: WidgetItem = { ...item, metadata: { display: 'line', invert: 'true', label: 'Custom ' }, numberFormat: { decimals: 2 } };
                expect(widget.render(inverted, context, DEFAULT_SETTINGS)).toBe('Custom ━━━━━━━━━━━━──── 75.00%');
                expect(widget.render({ ...inverted, rawValue: true }, context, DEFAULT_SETTINGS)).toBe('━━━━━━━━━━━━──── 75.00%');
            });

            it('offers the same controls as medium bars and retains cursor behavior', () => {
                const medium: WidgetItem = { ...item, metadata: { display: 'progress-short' } };
                expect(widget.getCustomKeybinds(item)).toEqual(widget.getCustomKeybinds(medium));
                const withCursor: WidgetItem = { ...item, metadata: { display: 'line', cursor: 'true' } };
                expect(widget.render(withCursor, context, DEFAULT_SETTINGS)).toBe(
                    label + (cursor ? '━━━━│─────────── 25.0%' : '━━━━──────────── 25.0%')
                );
                const inverted: WidgetItem = { ...item, metadata: { display: 'line', cursor: 'true', invert: 'true' } };
                expect(widget.render(inverted, context, DEFAULT_SETTINGS)).toBe(
                    label + (cursor ? '━━━━━━━━━━━━│─── 75.0%' : '━━━━━━━━━━━━──── 75.0%')
                );
            });

            it('appends line mode to the cycle and returns to text with the existing metadata cleanup', () => {
                const last: WidgetItem = { ...item, metadata: { display: 'slider-only', invert: 'true', cursor: 'true', label: 'Custom ' } };
                const line = widget.handleEditorAction('toggle-progress', last);
                expect(line).not.toBeNull();
                expect(line?.metadata).toEqual({ display: 'line', invert: 'true', cursor: 'true', label: 'Custom ' });
                const text = widget.handleEditorAction('toggle-progress', line ?? item);
                expect(text).not.toBeNull();
                expect(text?.metadata?.display).toBe('time');
                expect(text?.metadata?.cursor).toBeUndefined();
                expect(text?.metadata?.label).toBe('Custom ');
                expect(text?.metadata?.invert).toBe(type.includes('timer') ? undefined : 'true');
            });
        });
    }

    it('renders an empty line for an inactive block and retains no-data hiding', () => {
        const widget = new BlockTimerWidget();
        const item: WidgetItem = { id: 'block', type: 'block-timer', metadata: { display: 'line' } };
        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBe('Block ──────────────── 0.0%');
        expect(widget.render({ ...item, metadata: { display: 'line', hide: 'no-data' } }, {}, DEFAULT_SETTINGS)).toBeNull();
    });
});

describe('context line bars', () => {
    beforeEach(() => {
        vi.spyOn(claudeSettings, 'getAutoCompactConfig').mockReturnValue({});
    });
    afterEach(() => vi.restoreAllMocks());

    it.each([
        { widget: new ContextPercentageWidget(), type: 'context-percentage', live: 'Ctx Used: ━━━───────────── 20.0%', remaining: '━━━━━━━━━━━━━─── 80.0%', preview: 'Ctx Used: ━━━━━━━━━━━━━━── 90.0%' },
        { widget: new ContextPercentageUsableWidget(), type: 'context-percentage-usable', live: 'Ctx(u) Used: ━━━━──────────── 25.0%', remaining: '━━━━━━━━━━━━──── 75.0%', preview: 'Ctx(u) Used: ━━━━━━━━━━━━━━── 90.0%' }
    ])('renders $type live and preview values, with remaining mode and cycle support', ({ widget, type, live, remaining, preview }) => {
        const item: WidgetItem = { id: type, type, metadata: { display: 'line' } };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe(live);
        expect(widget.render(item, { isPreview: true }, DEFAULT_SETTINGS)).toBe(preview);
        expect(widget.render({ ...item, rawValue: true, metadata: { display: 'line', inverse: 'true' } }, context, DEFAULT_SETTINGS)).toBe(remaining);
        expect(widget.getEditorDisplay(item).modifierText).toBe('(line bar)');
        const line = widget.handleEditorAction('toggle-slider', { ...item, metadata: { display: 'slider-only', inverse: 'true' } });
        expect(line).not.toBeNull();
        expect(line?.metadata).toEqual({ display: 'line', inverse: 'true' });
        expect(widget.handleEditorAction('toggle-slider', line ?? item)?.metadata).toEqual({ inverse: 'true' });
    });

    it('retains the original Context Bar line appearance in live and preview output', () => {
        const widget = new ContextBarWidget();
        const item: WidgetItem = { id: 'context-bar', type: 'context-bar', metadata: { display: 'line' } };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Context: ━━━───────────── 40k/200k (20%)');
        expect(widget.render(item, { isPreview: true }, DEFAULT_SETTINGS)).toBe('Context: ━━━━━━━━━━━━━━── 180k/200k (90%)');
    });
});
