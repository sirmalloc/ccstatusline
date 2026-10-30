import { SEVEN_DAY_WINDOW_MS } from './usage-types';

// Less than a day of a week is too little to go on: one busy hour would read
// as the whole week's pace.
const MIN_ELAPSED_MS = 24 * 60 * 60 * 1000;

export interface WeeklyLimitInput {
    /** The 7-day window's used percent, 0-100. */
    percent: number;
    nowMs: number;
    resetAtMs: number;
}

/**
 * Milliseconds until the 7-day limit at this week's average pace: the used
 * percent over the time since the window started, its reset time minus 7 days.
 * Null unless that comes before the reset, and in the window's first day.
 */
export function getWeeklyLimitInMs({ percent, nowMs, resetAtMs }: WeeklyLimitInput): number | null {
    const leftMs = resetAtMs - nowMs;
    const elapsedMs = nowMs - (resetAtMs - SEVEN_DAY_WINDOW_MS);
    // A reset time that can't be read leaves nothing to measure against
    if (!Number.isFinite(leftMs) || leftMs <= 0 || elapsedMs < MIN_ELAPSED_MS || percent <= 0 || percent >= 100) {
        return null;
    }

    // Multiplying before dividing keeps whole-number inputs exact.
    const msToLimit = (100 - percent) * elapsedMs / percent;
    return msToLimit < leftMs ? msToLimit : null;
}
