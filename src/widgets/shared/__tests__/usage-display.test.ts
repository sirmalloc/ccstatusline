import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    cycleUsageDisplayMode,
    isAtSessionLimit,
    makeSliderBar
} from '../usage-display';

describe('makeSliderBar', () => {
    it('renders fully empty bar at 0%', () => {
        expect(makeSliderBar(0)).toBe('░░░░░░░░░░');
    });

    it('renders fully filled bar at 100%', () => {
        expect(makeSliderBar(100)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('renders half-filled bar at 50%', () => {
        expect(makeSliderBar(50)).toBe('▓▓▓▓▓░░░░░');
    });

    it('clamps values below 0', () => {
        expect(makeSliderBar(-10)).toBe('░░░░░░░░░░');
    });

    it('clamps values above 100', () => {
        expect(makeSliderBar(150)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('accepts custom width', () => {
        expect(makeSliderBar(50, 6)).toBe('▓▓▓░░░');
    });

    it('renders a time cursor when cursorPercent is provided', () => {
        expect(makeSliderBar(50, 10, { cursorPercent: 50 })).toBe('▓▓▓▓▓│░░░░');
    });

    it('clamps slider cursor percent', () => {
        expect(makeSliderBar(50, 10, { cursorPercent: -10 })).toBe('│▓▓▓▓░░░░░');
        expect(makeSliderBar(50, 10, { cursorPercent: 150 })).toBe('▓▓▓▓▓░░░░│');
    });
});

describe('cycleUsageDisplayMode with slider', () => {
    const base: WidgetItem = { id: 'test', type: 'session-usage' };

    it('includes slider modes when includeSlider is true', () => {
        const first = cycleUsageDisplayMode(base, [], true);
        const second = cycleUsageDisplayMode(first, [], true);
        const third = cycleUsageDisplayMode(second, [], true);
        const fourth = cycleUsageDisplayMode(third, [], true);
        const fifth = cycleUsageDisplayMode(fourth, [], true);

        expect(first.metadata?.display).toBe('progress');
        expect(second.metadata?.display).toBe('progress-short');
        expect(third.metadata?.display).toBe('slider');
        expect(fourth.metadata?.display).toBe('slider-only');
        expect(fifth.metadata?.display).toBe('time');
    });

    it('skips slider modes when includeSlider is false', () => {
        const first = cycleUsageDisplayMode(base);
        const second = cycleUsageDisplayMode(first);
        const third = cycleUsageDisplayMode(second);

        expect(first.metadata?.display).toBe('progress');
        expect(second.metadata?.display).toBe('progress-short');
        expect(third.metadata?.display).toBe('time');
    });

    it('keeps cursor metadata through slider modes and clears it when returning to time mode', () => {
        const cursorBase: WidgetItem = {
            ...base,
            metadata: { cursor: 'true' }
        };
        const first = cycleUsageDisplayMode(cursorBase, [], true);
        const second = cycleUsageDisplayMode(first, [], true);
        const third = cycleUsageDisplayMode(second, [], true);
        const fourth = cycleUsageDisplayMode(third, [], true);
        const fifth = cycleUsageDisplayMode(fourth, [], true);

        expect(first.metadata?.cursor).toBe('true');
        expect(second.metadata?.cursor).toBe('true');
        expect(third.metadata?.cursor).toBe('true');
        expect(fourth.metadata?.cursor).toBe('true');
        expect(fifth.metadata?.cursor).toBeUndefined();
    });
});

// Block Usage's at-limit and Block Reset Timer's under-limit states both read
// this, so the two always swap at the same render
describe('isAtSessionLimit', () => {
    it.each([
        ['under 100%', { sessionUsage: 60 }, false],
        ['just under 100%, which a whole-number percent shows as 100%', { sessionUsage: 99.7 }, false],
        ['at 100%', { sessionUsage: 100 }, true],
        ['over 100%', { sessionUsage: 100.4 }, true],
        ['unknown', {}, false],
        ['the usage API at 100% while the payload lags', { sessionUsage: 97, apiSessionUsage: 100 }, true],
        ['the usage API under 100% after the payload reached it', { sessionUsage: 100, apiSessionUsage: 2 }, false]
    ])('is %s → %s', (_label, usageData, expected) => {
        const payloadPercent = 'sessionUsage' in usageData ? usageData.sessionUsage : undefined;

        expect(isAtSessionLimit({ usageData, data: { rate_limits: { five_hour: { used_percentage: payloadPercent } } } })).toBe(expected);
    });

    // Merged usage data keeps an API percent prefetch rejected, as stale or
    // from a block that has since reset, when the payload has none of its own
    it('isn\'t at 100% from an API percent prefetch rejected', () => {
        expect(isAtSessionLimit({ usageData: { sessionUsage: 100 }, data: { rate_limits: { five_hour: { resets_at: 1 } } } })).toBe(false);
        expect(isAtSessionLimit({ usageData: { sessionUsage: 100 } })).toBe(false);
    });
});
