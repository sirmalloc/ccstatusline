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
import {
    WeeklyBudgetBufferWidget,
    computeBudgetBufferPercent,
    renderBipolarBar
} from '../WeeklyBudgetBuffer';

const item: WidgetItem = { id: 'b', type: 'weekly-budget-buffer' };

function ctx(weeklyUsage: number | undefined): RenderContext {
    return { usageData: weeklyUsage === undefined ? {} : { weeklyUsage } };
}

function makeWindow(elapsedPercent: number): UsageWindowMetrics {
    const total = 7 * 24 * 60 * 60 * 1000;
    const elapsedMs = (elapsedPercent / 100) * total;
    return {
        sessionDurationMs: total,
        elapsedMs,
        remainingMs: total - elapsedMs,
        elapsedPercent,
        remainingPercent: 100 - elapsedPercent
    };
}

describe('computeBudgetBufferPercent', () => {
    it('returns zero when usage matches elapsed pace', () => {
        // 3/5 elapsed of 5-day window, but formula uses 7-day window:
        // (50% - 50%) * 7 = 0
        expect(computeBudgetBufferPercent(50, 50)).toBe(0);
    });

    it('returns +700 when nothing spent at full elapsed', () => {
        // unrealistic edge: full buffer = 7 days
        expect(computeBudgetBufferPercent(0, 100)).toBe(700);
    });

    it('returns negative when overspending', () => {
        // 50% elapsed, 60% used → -10% * 7 = -70%
        expect(computeBudgetBufferPercent(60, 50)).toBe(-70);
    });
});

describe('renderBipolarBar', () => {
    it('renders empty bar at zero', () => {
        const bar = renderBipolarBar(0, '', '');
        expect(bar).toBe('░░░░░░░░░░│░░░░░░░░░░');
        expect(bar.length).toBe(21);
    });

    it('fills right half for positive', () => {
        const bar = renderBipolarBar(50, '', '');
        expect(bar).toBe('░░░░░░░░░░│▓▓▓▓▓░░░░░');
    });

    it('fills left half for negative', () => {
        const bar = renderBipolarBar(-100, '', '');
        expect(bar).toBe('▓▓▓▓▓▓▓▓▓▓│░░░░░░░░░░');
    });

    it('clamps oversized positive to full right', () => {
        const bar = renderBipolarBar(999, '', '');
        expect(bar).toBe('░░░░░░░░░░│▓▓▓▓▓▓▓▓▓▓');
    });
});

describe('WeeklyBudgetBufferWidget.render', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns null when weeklyUsage missing', () => {
        const widget = new WeeklyBudgetBufferWidget();
        expect(widget.render(item, ctx(undefined), DEFAULT_SETTINGS)).toBeNull();
    });

    it('returns null when no reset window', () => {
        const widget = new WeeklyBudgetBufferWidget();
        vi.spyOn(usage, 'resolveWeeklyUsageWindow').mockReturnValue(null);
        expect(widget.render(item, ctx(20), DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders zero when on pace', () => {
        const widget = new WeeklyBudgetBufferWidget();
        vi.spyOn(usage, 'resolveWeeklyUsageWindow').mockReturnValue(makeWindow(50));
        const out = widget.render(item, ctx(50), DEFAULT_SETTINGS);
        expect(out).toContain('0%');
        expect(out).toContain('│');
    });

    it('renders signed positive when under pace', () => {
        const widget = new WeeklyBudgetBufferWidget();
        vi.spyOn(usage, 'resolveWeeklyUsageWindow').mockReturnValue(makeWindow(50));
        // (50-40)*7 = +70
        const out = widget.render(item, ctx(40), DEFAULT_SETTINGS);
        expect(out).toContain('+70%');
    });

    it('renders signed negative when over pace', () => {
        const widget = new WeeklyBudgetBufferWidget();
        vi.spyOn(usage, 'resolveWeeklyUsageWindow').mockReturnValue(makeWindow(50));
        // (50-60)*7 = -70
        const out = widget.render(item, ctx(60), DEFAULT_SETTINGS);
        expect(out).toContain('-70%');
    });

    it('renders error message on usage error', () => {
        const widget = new WeeklyBudgetBufferWidget();
        const out = widget.render(item, { usageData: { error: 'rate-limited' } }, DEFAULT_SETTINGS);
        expect(out).toBe('[Rate limited]');
    });
});
