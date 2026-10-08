import type { SessionForecast } from '../types/SessionForecast';

/** One session percent, from the first to the last render that saw it. */
export type SessionUsageReading = [firstSeenMs: number, lastSeenMs: number, percent: number];

export interface SessionForecastInput {
    readings: SessionUsageReading[];
    nowMs: number;
    resetAtMs: number;
    /** The current used percent, 0-100. */
    percent: number;
}

const SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;
// The pace is measured over this much recent time.
export const LOOKBACK_MS = 30 * 60 * 1000;
// Too little time to trust a pace; only a window's first minutes are this short.
const MIN_SPAN_MS = 10 * 60 * 1000;
// Readings this far past now come from a clock that has since moved back.
export const FUTURE_TOLERANCE_MS = 60 * 1000;

interface KnownPoint {
    timeMs: number;
    percent: number;
}

// Every moment the percent is known: the window's start (always 0%), each
// reading's first and last sighting, and now.
function getKnownPoints({ readings, nowMs, resetAtMs, percent }: SessionForecastInput): KnownPoint[] {
    const windowStartMs = resetAtMs - SESSION_WINDOW_MS;
    const points: KnownPoint[] = [{ timeMs: windowStartMs, percent: 0 }];

    for (const [firstSeenMs, lastSeenMs, readingPercent] of readings) {
        if (firstSeenMs > nowMs + FUTURE_TOLERANCE_MS) {
            continue;
        }

        for (const timeMs of [firstSeenMs, Math.min(lastSeenMs, nowMs)]) {
            if (timeMs >= windowStartMs) {
                points.push({ timeMs, percent: readingPercent });
            }
        }
    }

    points.push({ timeMs: nowMs, percent });
    return points.sort((a, b) => a.timeMs - b.timeMs);
}

// The percent at timeMs on the straight line between the known points either
// side of it: a reading's own percent while it was being seen, and a change
// across a gap with no renders spread evenly over the gap.
function percentAt(points: KnownPoint[], timeMs: number): number {
    let before: KnownPoint | undefined;
    for (const point of points) {
        if (point.timeMs > timeMs && before) {
            return before.percent + (point.percent - before.percent) * (timeMs - before.timeMs) / (point.timeMs - before.timeMs);
        }
        before = point;
    }

    return before?.percent ?? 0;
}

/** Where the 5-hour window's usage is heading at the recent pace, or null with nothing to say. */
export function forecastSessionUsage(input: SessionForecastInput): SessionForecast | null {
    const { nowMs, resetAtMs, percent } = input;
    const leftMs = resetAtMs - nowMs;
    if (leftMs <= 0 || percent >= 100) {
        return null;
    }

    const startMs = Math.max(nowMs - LOOKBACK_MS, resetAtMs - SESSION_WINDOW_MS);
    const spanMs = nowMs - startMs;
    if (spanMs < MIN_SPAN_MS) {
        return null;
    }

    const rise = percent - percentAt(getKnownPoints(input), startMs);
    if (rise <= 0) {
        return null;
    }

    // Multiplying before dividing keeps whole-number inputs exact.
    const projectedPercent = percent + rise * leftMs / spanMs;
    const msToLimit = (100 - percent) * spanMs / rise;
    return {
        projectedPercent: Math.min(100, projectedPercent),
        limitInMs: msToLimit < leftMs ? msToLimit : null
    };
}
