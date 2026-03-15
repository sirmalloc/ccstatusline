import type { BlockMetrics } from '../types';

import { getCachedBlockMetrics } from './jsonl';
import {
    FIVE_HOUR_BLOCK_MS,
    SEVEN_DAY_WINDOW_MS,
    type UsageData,
    type UsageError,
    type UsageWindowMetrics
} from './usage-types';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function buildUsageWindow(resetAtMs: number, nowMs: number, durationMs: number): UsageWindowMetrics | null {
    if (!Number.isFinite(resetAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
        return null;
    }

    const startAtMs = resetAtMs - durationMs;
    const elapsedMs = clamp(nowMs - startAtMs, 0, durationMs);
    const remainingMs = durationMs - elapsedMs;
    const elapsedPercent = (elapsedMs / durationMs) * 100;

    return {
        sessionDurationMs: durationMs,
        elapsedMs,
        remainingMs,
        elapsedPercent,
        remainingPercent: 100 - elapsedPercent
    };
}

export function getUsageWindowFromResetAt(sessionResetAt: string | undefined, nowMs = Date.now()): UsageWindowMetrics | null {
    if (!sessionResetAt) {
        return null;
    }

    const resetAtMs = Date.parse(sessionResetAt);
    if (Number.isNaN(resetAtMs)) {
        return null;
    }

    return buildUsageWindow(resetAtMs, nowMs, FIVE_HOUR_BLOCK_MS);
}

export function getUsageWindowFromBlockMetrics(blockMetrics: BlockMetrics, nowMs = Date.now()): UsageWindowMetrics | null {
    const startAtMs = blockMetrics.startTime.getTime();
    if (Number.isNaN(startAtMs)) {
        return null;
    }

    return buildUsageWindow(startAtMs + FIVE_HOUR_BLOCK_MS, nowMs, FIVE_HOUR_BLOCK_MS);
}

export function resolveUsageWindowWithFallback(
    usageData: UsageData,
    blockMetrics?: BlockMetrics | null,
    nowMs = Date.now()
): UsageWindowMetrics | null {
    const usageWindow = getUsageWindowFromResetAt(usageData.sessionResetAt, nowMs);
    if (usageWindow) {
        return usageWindow;
    }

    const fallbackMetrics = blockMetrics ?? getCachedBlockMetrics();
    if (!fallbackMetrics) {
        return null;
    }

    return getUsageWindowFromBlockMetrics(fallbackMetrics, nowMs);
}

export function getWeeklyUsageWindowFromResetAt(weeklyResetAt: string | undefined, nowMs = Date.now()): UsageWindowMetrics | null {
    if (!weeklyResetAt) {
        return null;
    }

    const resetAtMs = Date.parse(weeklyResetAt);
    if (Number.isNaN(resetAtMs)) {
        return null;
    }

    return buildUsageWindow(resetAtMs, nowMs, SEVEN_DAY_WINDOW_MS);
}

export function resolveWeeklyUsageWindow(usageData: UsageData, nowMs = Date.now()): UsageWindowMetrics | null {
    return getWeeklyUsageWindowFromResetAt(usageData.weeklyResetAt, nowMs);
}

export function formatUsageDuration(durationMs: number, compact = false, useDays = true): string {
    const clampedMs = Math.max(0, durationMs);
    const totalHours = Math.floor(clampedMs / (1000 * 60 * 60));
    const m = Math.floor((clampedMs % (1000 * 60 * 60)) / (1000 * 60));

    const hLabel = compact ? 'h' : 'hr';
    const sep = compact ? '' : ' ';
    const d = useDays ? Math.floor(totalHours / 24) : 0;
    const h = useDays ? totalHours % 24 : totalHours;
    const parts = [d > 0 && `${d}d`, h > 0 && `${h}${hLabel}`, m > 0 && `${m}m`].filter(Boolean);
    return parts.length > 0 ? parts.join(sep) : '0m';
}

export function getUsageErrorMessage(error: UsageError): string {
    switch (error) {
        case 'no-credentials': return '[No credentials]';
        case 'timeout': return '[Timeout]';
        case 'rate-limited': return '[Rate limited]';
        case 'api-error': return '[API Error]';
        case 'parse-error': return '[Parse Error]';
    }
}

export function makeUsageProgressBar(percent: number, width = 15): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}