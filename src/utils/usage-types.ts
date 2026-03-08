import { z } from 'zod';

export const FIVE_HOUR_BLOCK_MS = 5 * 60 * 60 * 1000;
export const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const UsageErrorSchema = z.enum(['no-credentials', 'timeout', 'rate-limited', 'api-error', 'parse-error']);
export type UsageError = z.infer<typeof UsageErrorSchema>;

export interface UsageData {
    sessionUsage?: number;  // five_hour.utilization (percentage)
    sessionResetAt?: string; // five_hour.resets_at
    weeklyUsage?: number;   // seven_day.utilization (percentage)
    weeklyResetAt?: string; // seven_day.resets_at
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;      // in cents
    extraUsageUsed?: number;       // in cents
    extraUsageUtilization?: number;
    error?: UsageError;
}

export interface UsageWindowMetrics {
    sessionDurationMs: number;
    elapsedMs: number;
    remainingMs: number;
    elapsedPercent: number;
    remainingPercent: number;
}