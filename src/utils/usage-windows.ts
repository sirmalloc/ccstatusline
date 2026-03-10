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

export function formatUsageDuration(durationMs: number, compact = false): string {
    const clampedMs = Math.max(0, durationMs);
    const totalMinutes = Math.floor(clampedMs / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (compact) {
        if (days > 0) {
            return minutes === 0 ? `${days}d${hours}h` : `${days}d${hours}h${minutes}m`;
        }
        return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
    }

    if (days > 0) {
        if (minutes === 0) {
            return hours === 0 ? `${days}d` : `${days}d ${hours}hr`;
        }
        return `${days}d ${hours}hr ${minutes}m`;
    }

    if (minutes === 0) {
        return `${hours}hr`;
    }

    return `${hours}hr ${minutes}m`;
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