/**
 * Speed metrics for calculating token processing rates.
 * Provides time-based data needed for speed calculations.
 */
export interface SpeedMetrics {
    /** Active processing duration in milliseconds (sum of user request → assistant response times) */
    totalDurationMs: number;

    /** Total input tokens across all requests */
    inputTokens: number;

    /** Total output tokens across all requests */
    outputTokens: number;

    /** Total tokens (input + output) */
    totalTokens: number;

    /** Number of API requests (entries with message.usage, excluding sidechains) */
    requestCount: number;
}