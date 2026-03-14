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
    const elapsedHours = Math.floor(clampedMs / (1000 * 60 * 60));
    const elapsedMinutes = Math.floor((clampedMs % (1000 * 60 * 60)) / (1000 * 60));

    if (compact) {
        return elapsedMinutes === 0 ? `${elapsedHours}h` : `${elapsedHours}h${elapsedMinutes}m`;
    }

    if (elapsedMinutes === 0) {
        return `${elapsedHours}hr`;
    }

    return `${elapsedHours}hr ${elapsedMinutes}m`;
}

export function formatUsageDurationDaysHours(durationMs: number): string {
    const clampedMs = Math.max(0, durationMs);
    const days = Math.floor(clampedMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((clampedMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days === 0) {
        return `${hours}hr`;
    }

    if (hours === 0) {
        return `${days}d`;
    }

    return `${days}d ${hours}hr`;
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