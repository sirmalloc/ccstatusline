import {
    describe,
    expect,
    it
} from 'vitest';

import {
    forecastSessionUsage,
    type SessionUsageReading
} from '../session-forecast';

const MINUTE = 60 * 1000;

// 2026-10-08 at hh:mm UTC
function at(hours: number, minutes: number): number {
    return Date.UTC(2026, 9, 8, hours, minutes);
}

// The spec's worked examples: reset at 15:00, now 13:17, so 103 minutes are left
// and the lookback starts at 12:47.
const NOW = at(13, 17);
const RESET_AT = at(15, 0);

function forecast(readings: SessionUsageReading[], percent: number, nowMs = NOW, resetAtMs = RESET_AT) {
    return forecastSessionUsage({ readings, nowMs, resetAtMs, percent });
}

describe('forecastSessionUsage', () => {
    it('projects from the reading seen across the lookback start, as the bash script does', () => {
        const result = forecast([[at(12, 20), at(12, 52), 30], [at(12, 53), at(13, 17), 42]], 42);

        expect(result?.projectedPercent).toBeCloseTo(83.2, 6);
        expect(result?.limitInMs).toBeNull();
    });

    it('spreads a change across a gap with no renders evenly over the gap', () => {
        // 30% at 12:10, then nothing until 42% at 13:10: at 12:47, 37 of the gap's
        // 60 minutes have passed, so the estimate is 30 + 12 * 37/60 = 37.4%.
        const result = forecast([[at(11, 40), at(12, 10), 30], [at(13, 10), at(13, 17), 42]], 42);

        expect(result?.projectedPercent).toBeCloseTo(42 + (42 - 37.4) * 103 / 30, 6);
        expect(result?.limitInMs).toBeNull();
    });

    it('caps the projection at 100% and says when the limit comes first', () => {
        const result = forecast([[at(12, 20), at(12, 52), 45], [at(12, 53), at(13, 17), 61]], 61);

        // 16% in 30 minutes: 39% more takes 73.125 minutes, before the reset in 103.
        expect(result).toEqual({ projectedPercent: 100, limitInMs: 4_387_500 });
    });

    it('lands exactly on 100% at the reset without a limit time', () => {
        // 15% in 30 minutes, 120 minutes left: 40 + 60 = 100, reached at the reset itself.
        const result = forecast([[at(12, 20), at(12, 52), 25]], 40, NOW, at(15, 17));

        expect(result).toEqual({ projectedPercent: 100, limitInMs: null });
    });

    it('uses the whole window so far before the first reading', () => {
        // The window began at 10:00 at 0%: the line from there to 42% now gives
        // the whole-window average, the bash script's fallback.
        const result = forecast([], 42);

        expect(result?.projectedPercent).toBeCloseTo(42 + 42 * 103 / 197, 6);
        expect(result?.limitInMs).toBeNull();
    });

    it('starts at the window start in a window younger than 30 minutes', () => {
        // Window began 10:00, now 10:20: 10% in 20 minutes, 280 minutes left.
        const result = forecast([[at(10, 5), at(10, 20), 10]], 10, at(10, 20));

        expect(result).toEqual({ projectedPercent: 100, limitInMs: 180 * MINUTE });
    });

    it('forecasts once the window is 10 minutes old', () => {
        expect(forecast([], 5, at(10, 10))).toEqual({ projectedPercent: 100, limitInMs: 190 * MINUTE });
    });

    it('stays quiet in a window younger than 10 minutes', () => {
        expect(forecast([], 5, at(10, 10) - 1000)).toBeNull();
    });

    it.each([
        ['idle', [[at(12, 20), at(13, 17), 42]] as SessionUsageReading[], 42],
        ['falling', [[at(12, 20), at(12, 52), 50]] as SessionUsageReading[], 42],
        ['already at 100%', [[at(12, 20), at(12, 52), 90]] as SessionUsageReading[], 100]
    ])('stays quiet when usage is %s', (_label, readings, percent) => {
        expect(forecast(readings, percent)).toBeNull();
    });

    it.each([
        ['now', NOW],
        ['in the past', at(13, 0)]
    ])('stays quiet when the reset is %s', (_label, resetAtMs) => {
        expect(forecast([[at(12, 20), at(12, 52), 30]], 42, NOW, resetAtMs)).toBeNull();
    });

    it('ignores readings from a clock that has since moved back', () => {
        const result = forecast([
            [at(12, 20), at(12, 52), 30],
            [at(12, 53), at(13, 17), 42],
            [at(13, 30), at(13, 31), 99]
        ], 42);

        expect(result?.projectedPercent).toBeCloseTo(83.2, 6);
    });

    it('treats a last-seen time past now as now', () => {
        const result = forecast([[at(12, 20), at(13, 40), 30]], 42);

        expect(result?.projectedPercent).toBeCloseTo(83.2, 6);
    });
});
