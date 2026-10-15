export interface SessionForecast {
    /** Used percent the forecast goes from: the latest reading's when an idle session's own is behind it. */
    currentPercent: number;
    /** Used percent at the 5-hour window's reset at the current pace, capped at 100. */
    projectedPercent: number;
    /** Milliseconds until 100% at the current pace; null unless that comes before the reset. */
    limitInMs: number | null;
}
