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

// TypeScript can't narrow `target[field] = value` when `field` is a plain
// UsageDataField union at the call site (it can't prove `value`'s type
// matches whichever union member `field` happens to be), but it can when both
// are tied to the same generic `K` here. Shared because both usage-fetch.ts
// and usage-prefetch.ts need to assign UsageData fields by a dynamic key.
export function setUsageField<K extends UsageDataField>(target: Partial<UsageData>, field: K, value: UsageData[K]): void {
    target[field] = value;
}

// Single source of truth for the per-model weekly usage buckets (Sonnet, Opus,
// ...). Every place that used to hand-list "sonnet, then opus" (the widget
// registry, the API/cache schemas, the rate-limits extractor) now derives from
// this array instead, so adding or renaming a model bucket can't desync one of
// those spots from the others.
export interface WeeklyModelUsageBucket {
    widgetType: string;
    // As of 2026-07, /api/oauth/usage reports per-model weekly usage as an
    // entry in its `limits` array (kind: "weekly_scoped", matched by
    // scope.model.display_name), not as a flat bucket -- the older
    // seven_day_sonnet/seven_day_opus-style flat keys were observed returning
    // null even for models with real usage. modelDisplayName drives that
    // limits[] lookup; apiBucketKey is kept only as a fallback for API
    // responses (or stale caches) that still populate the flat key.
    modelDisplayName: string; // e.g. "Sonnet", "Opus", matched against limits[].scope.model.display_name
    apiBucketKey: string; // legacy flat key, e.g. "seven_day_sonnet" -- see modelDisplayName above
    usageField: UsageDataField;
    resetField: UsageDataField;
}

export const WEEKLY_MODEL_USAGE_BUCKETS: readonly WeeklyModelUsageBucket[] = [
    { widgetType: 'weekly-sonnet-usage', modelDisplayName: 'Sonnet', apiBucketKey: 'seven_day_sonnet', usageField: 'weeklySonnetUsage', resetField: 'weeklySonnetResetAt' },
    { widgetType: 'weekly-opus-usage', modelDisplayName: 'Opus', apiBucketKey: 'seven_day_opus', usageField: 'weeklyOpusUsage', resetField: 'weeklyOpusResetAt' }
];
