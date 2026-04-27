import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    cycleUsageDisplayMode,
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
});
