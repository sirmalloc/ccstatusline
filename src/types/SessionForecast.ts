export interface SessionForecast {
    /** Used percent at the 5-hour window's reset at the current pace, capped at 100. */
    projectedPercent: number;
    /** Milliseconds until 100% at the current pace; null unless that comes before the reset. */
    limitInMs: number | null;
}
