import {
    describe,
    expect,
    it
} from 'vitest';

import { getWeeklyLimitInMs } from '../weekly-limit';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A window that resets Thursday 2026-10-15 at 00:00 UTC, so it started Thursday
// 2026-10-08 at 00:00 UTC.
const RESET_AT = Date.UTC(2026, 9, 15);
const WINDOW_START = RESET_AT - 7 * DAY;

function limitIn(percent: number, elapsedMs: number, resetAtMs = RESET_AT): number | null {
    return getWeeklyLimitInMs({ percent, nowMs: WINDOW_START + elapsedMs, resetAtMs });
}

describe('getWeeklyLimitInMs', () => {
    it('extrapolates this week\'s average pace to 100%', () => {
        // 72% in 5 days is 14.4% a day, so the other 28% take 28 / 14.4 days:
        // 46h 40m, before the reset 2 days away.
        expect(limitIn(72, 5 * DAY)).toBe(46 * HOUR + 40 * 60 * 1000);
    });

    it('measures the pace from the window\'s start, reset time minus 7 days', () => {
        // 30% one day in: the other 70% take 70 / 30 days, 56 hours.
        expect(limitIn(30, DAY)).toBe(56 * HOUR);
    });

    it('says nothing when the pace reaches the limit after the reset', () => {
        // 50% in 5 days: another 5 days, but the reset is 2 days away
        expect(limitIn(50, 5 * DAY)).toBeNull();
    });

    it('says nothing when the pace reaches the limit exactly at the reset', () => {
        expect(limitIn(50, 3.5 * DAY)).toBeNull();
    });

    it('waits until the window is a day old', () => {
        expect(limitIn(30, DAY - 1)).toBeNull();
        expect(limitIn(30, DAY)).not.toBeNull();
    });

    it.each([
        ['nothing is used yet', 0],
        ['the limit is reached', 100],
        ['the percent is past the limit', 100.4]
    ])('says nothing when %s', (_label, percent) => {
        expect(limitIn(percent, 5 * DAY)).toBeNull();
    });

    it('says nothing once the window has reset', () => {
        expect(limitIn(72, 7 * DAY)).toBeNull();
        expect(limitIn(72, 8 * DAY)).toBeNull();
    });

    it('says nothing for a reset time that can\'t be read', () => {
        expect(getWeeklyLimitInMs({ percent: 72, nowMs: WINDOW_START + 5 * DAY, resetAtMs: Number.NaN })).toBeNull();
    });
});
