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
    weeklySonnetUsage?: number;   // seven_day_sonnet.utilization (percentage)
    weeklySonnetResetAt?: string; // seven_day_sonnet.resets_at
    weeklyOpusUsage?: number;     // seven_day_opus.utilization (percentage)
    weeklyOpusResetAt?: string;   // seven_day_opus.resets_at
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;      // in cents (divide by 100 for dollars)
    extraUsageUsed?: number;       // in cents (divide by 100 for dollars)
    extraUsageUtilization?: number; // percentage 0-100
    extraUsageCurrency?: string;   // ISO 4217 currency code (e.g. 'USD', 'EUR')
    error?: UsageError;
}

export interface UsageWindowMetrics {
    sessionDurationMs: number;
    elapsedMs: number;
    remainingMs: number;
    elapsedPercent: number;
    remainingPercent: number;
}

export type UsageDataField = Exclude<keyof UsageData, 'error'>;

// Single source of truth for the per-model weekly usage buckets (Sonnet, Opus,
// ...). Every place that used to hand-list "sonnet, then opus" (the widget
// registry, the API/cache schemas, the rate-limits extractor) now derives from
// this array instead, so adding or renaming a model bucket can't desync one of
// those spots from the others.
export interface WeeklyModelUsageBucket {
    widgetType: string;
    apiBucketKey: string; // key in both the /api/oauth/usage response and the rate_limits hook payload, e.g. "seven_day_sonnet"
    usageField: UsageDataField;
    resetField: UsageDataField;
}

export const WEEKLY_MODEL_USAGE_BUCKETS: readonly WeeklyModelUsageBucket[] = [
    { widgetType: 'weekly-sonnet-usage', apiBucketKey: 'seven_day_sonnet', usageField: 'weeklySonnetUsage', resetField: 'weeklySonnetResetAt' },
    { widgetType: 'weekly-opus-usage', apiBucketKey: 'seven_day_opus', usageField: 'weeklyOpusUsage', resetField: 'weeklyOpusResetAt' }
];
