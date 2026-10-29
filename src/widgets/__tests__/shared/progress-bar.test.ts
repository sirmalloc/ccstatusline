import {
    describe,
    expect,
    it
} from 'vitest';

import { makeTimerProgressBar } from '../../shared/progress-bar';

describe('makeTimerProgressBar', () => {
    it('renders a fully empty bar at 0%', () => {
        expect(makeTimerProgressBar(0, 16)).toBe('░░░░░░░░░░░░░░░░');
    });

    it('renders a fully filled bar at 100%', () => {
        expect(makeTimerProgressBar(100, 16)).toBe('████████████████');
    });

    it('renders a partially filled bar at 50%', () => {
        expect(makeTimerProgressBar(50, 16)).toBe('████████░░░░░░░░');
    });

    it('clamps percent below 0', () => {
        expect(makeTimerProgressBar(-10, 16)).toBe('░░░░░░░░░░░░░░░░');
    });

    it('clamps percent above 100', () => {
        expect(makeTimerProgressBar(150, 16)).toBe('████████████████');
    });

    it('renders with a 32-char width', () => {
        const bar = makeTimerProgressBar(25, 32);
        expect(bar).toHaveLength(32);
        expect(bar).toBe('████████░░░░░░░░░░░░░░░░░░░░░░░░');
    });

    describe('time cursor', () => {
        it('places cursor at the correct position', () => {
            const bar = makeTimerProgressBar(50, 16, { cursorPercent: 50 });
            expect(bar).toBe('████████│░░░░░░░');
        });

        it('places cursor within the filled region', () => {
            const bar = makeTimerProgressBar(75, 16, { cursorPercent: 25 });
            expect(bar).toBe('████│███████░░░░');
        });

        it('places cursor within the empty region', () => {
            const bar = makeTimerProgressBar(25, 16, { cursorPercent: 75 });
            expect(bar).toBe('████░░░░░░░░│░░░');
        });

        it('places cursor at position 0', () => {
            const bar = makeTimerProgressBar(50, 16, { cursorPercent: 0 });
            expect(bar).toBe('│███████░░░░░░░░');
        });

        it('places cursor at the last position for 100%', () => {
            const bar = makeTimerProgressBar(50, 16, { cursorPercent: 100 });
            expect(bar).toBe('████████░░░░░░░│');
        });

        it('clamps negative cursor percent', () => {
            const bar = makeTimerProgressBar(50, 16, { cursorPercent: -10 });
            expect(bar).toBe('│███████░░░░░░░░');
        });

        it('clamps cursor percent above 100', () => {
            const bar = makeTimerProgressBar(50, 16, { cursorPercent: 150 });
            expect(bar).toBe('████████░░░░░░░│');
        });

        it('does not render cursor when cursorPercent is undefined', () => {
            const bar = makeTimerProgressBar(50, 16, {});
            expect(bar).toBe('████████░░░░░░░░');
        });
    });
});
