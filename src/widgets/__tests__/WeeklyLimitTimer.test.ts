import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    RenderUsageData
} from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
// Imported before the widgets, as the reset timer tests do: loading a widget first
// enters the usage -> config -> widget registry import cycle midway under Node.
import { formatUsageDuration } from '../../utils/usage';
import { FableWeeklyLimitTimerWidget } from '../FableWeeklyLimitTimer';
import { WeeklyLimitTimerWidget } from '../WeeklyLimitTimer';

const DAY = 24 * 60 * 60 * 1000;

// Five days into a window that resets Thursday 2026-10-15 at 00:00 UTC
const RESET_AT = '2026-10-15T00:00:00.000Z';
const NOW = Date.parse(RESET_AT) - 2 * DAY;

interface TimerCase {
    name: string;
    type: string;
    create: () => WeeklyLimitTimerWidget;
    displayName: string;
    label: string;
    preview: [full: string, compact: string];
    usage: (percent: number | undefined, resetAt?: string) => RenderUsageData;
}

const TIMERS: TimerCase[] = [
    {
        name: 'WeeklyLimitTimerWidget',
        type: 'weekly-limit-timer',
        create: () => new WeeklyLimitTimerWidget(),
        displayName: 'Weekly Limit Timer',
        label: 'Weekly limit in: ',
        preview: ['1d 13hr', '1d13h'],
        usage: (weeklyUsage, weeklyResetAt) => ({ weeklyUsage, weeklyResetAt })
    },
    {
        name: 'FableWeeklyLimitTimerWidget',
        type: 'fable-weekly-limit-timer',
        create: () => new FableWeeklyLimitTimerWidget(),
        displayName: 'Weekly Fable Limit Timer',
        label: 'Fable limit in: ',
        preview: ['2d 4hr', '2d4h'],
        usage: (fableUsage, fableResetAt) => ({ fableUsage, fableResetAt })
    }
];

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe.each(TIMERS)('$name', (timer) => {
    const ITEM: WidgetItem = { id: 'limit', type: timer.type };
    const COMPACT: WidgetItem = { ...ITEM, metadata: { compact: 'true' } };

    function render(item: WidgetItem, context: RenderContext = {}): string | null {
        return timer.create().render(item, context, DEFAULT_SETTINGS);
    }

    function usage(percent: number | undefined, resetAt = RESET_AT): RenderContext {
        return { usageData: timer.usage(percent, resetAt) };
    }

    it('shows the time until the weekly limit at this week\'s average pace', () => {
        // 72% in 5 days: the other 28% take 46h 40m
        expect(render(ITEM, usage(72))).toBe(`${timer.label}1d 22hr 40m`);
    });

    it('formats durations like the reset timers', () => {
        const limitInMs = 46 * 60 * 60 * 1000 + 40 * 60 * 1000;

        expect(render(ITEM, usage(72))).toBe(`${timer.label}${formatUsageDuration(limitInMs)}`);
        expect(render(COMPACT, usage(72))).toBe(`${timer.label}${formatUsageDuration(limitInMs, true)}`);
    });

    it('shows the short form with s', () => {
        expect(render(COMPACT, usage(72))).toBe(`${timer.label}1d22h40m`);
    });

    it('drops the label in raw value mode', () => {
        expect(render({ ...ITEM, rawValue: true }, usage(72))).toBe('1d 22hr 40m');
    });

    it('never shows 0m in the last minute', () => {
        // 30 seconds of the remaining pace at 5 days in
        const percent = 100 * 432_000_000 / (432_000_000 + 30_000);

        expect(render(ITEM, usage(percent))).toBe(`${timer.label}1m`);
    });

    it.each([
        ['the limit comes after the reset', 50],
        ['the limit is reached', 100],
        ['nothing is used yet', 0],
        ['there is no percent', undefined]
    ])('renders nothing when %s', (_label, percent) => {
        expect(render(ITEM, usage(percent))).toBeNull();
    });

    it('renders nothing while the window is less than a day old', () => {
        expect(render(ITEM, usage(30, new Date(NOW + 6.5 * DAY).toISOString()))).toBeNull();
    });

    it('renders nothing without a reset time', () => {
        expect(render(ITEM, { usageData: timer.usage(72) })).toBeNull();
    });

    it('renders nothing without usage data', () => {
        expect(render(ITEM, {})).toBeNull();
    });

    it('shows a sample in the preview', () => {
        expect(render(ITEM, { isPreview: true })).toBe(`${timer.label}${timer.preview[0]}`);
        expect(render(COMPACT, { isPreview: true })).toBe(`${timer.label}${timer.preview[1]}`);
    });

    it('describes itself for the line editor', () => {
        const widget = timer.create();

        expect(widget.getDisplayName()).toBe(timer.displayName);
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getDefaultColor()).toBe('red');
        expect(widget.getLabelPrefix()).toBe(timer.label);
        expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(COMPACT).modifierText).toBe('(compact)');
    });

    it('toggles the short form with s', () => {
        const widget = timer.create();

        expect(widget.getCustomKeybinds()).toEqual([{ key: 's', label: '(s)hort time', action: 'toggle-compact' }]);
        expect(widget.handleEditorAction('toggle-compact', ITEM)?.metadata?.compact).toBe('true');
        expect(widget.handleEditorAction('toggle-invert', ITEM)).toBeNull();
    });
});

describe('the weekly limit timers\' windows', () => {
    const render = (widget: WeeklyLimitTimerWidget, usageData: RenderUsageData): string | null => widget.render({ id: 'limit', type: 'weekly-limit-timer' }, { usageData }, DEFAULT_SETTINGS);

    it('reads only the all-models window for Weekly Limit Timer', () => {
        expect(render(new WeeklyLimitTimerWidget(), { weeklyUsage: 72, weeklyResetAt: RESET_AT, fableUsage: 50, fableResetAt: RESET_AT })).toBe('Weekly limit in: 1d 22hr 40m');
        expect(render(new WeeklyLimitTimerWidget(), { fableUsage: 72, fableResetAt: RESET_AT })).toBeNull();
    });

    it('reads only Fable\'s percent for Weekly Fable Limit Timer', () => {
        expect(render(new FableWeeklyLimitTimerWidget(), { weeklyUsage: 72, weeklyResetAt: RESET_AT })).toBeNull();
    });

    // As Weekly Fable Usage's time cursor does when the API sends no Fable reset
    it('falls back to the all-models reset for Fable\'s window', () => {
        expect(render(new FableWeeklyLimitTimerWidget(), { fableUsage: 72, weeklyResetAt: RESET_AT })).toBe('Fable limit in: 1d 22hr 40m');
    });
});
