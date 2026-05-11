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

export function resolveWeeklySonnetUsageWindow(usageData: UsageData, nowMs = Date.now()): UsageWindowMetrics | null {
    return getWeeklyUsageWindowFromResetAt(usageData.weeklySonnetResetAt ?? usageData.weeklyResetAt, nowMs);
}

export function resolveWeeklyOpusUsageWindow(usageData: UsageData, nowMs = Date.now()): UsageWindowMetrics | null {
    return getWeeklyUsageWindowFromResetAt(usageData.weeklyOpusResetAt ?? usageData.weeklyResetAt, nowMs);
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

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}

function formatResetAtUtc(date: Date, compact: boolean, hour12: boolean): string {
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());

    if (hour12) {
        const hour = date.getUTCHours();
        const displayHour = (hour % 12) || 12;
        const period = hour >= 12 ? 'PM' : 'AM';

        return compact
            ? `${month}-${day} ${displayHour}:${minutes} ${period}Z`
            : `${year}-${month}-${day} ${displayHour}:${minutes} ${period} UTC`;
    }

    return compact
        ? `${month}-${day} ${hours}:${minutes}Z`
        : `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

const DEFAULT_TZ_LOCALE = 'en-US';

function normalizeDayPeriod(dayPeriod: string): string {
    return dayPeriod.replace(/\./g, '').toUpperCase();
}

function formatResetAtInTimezone(
    date: Date,
    compact: boolean,
    timezone: string | undefined,
    locale: string,
    hour12: boolean
): string | null {
    try {
        const formatter = new Intl.DateTimeFormat(locale, {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12,
            timeZoneName: 'short'
        });
        const parts = formatter.formatToParts(date);
        const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '';

        const year = get('year');
        const month = get('month');
        const day = get('day');
        const hour = get('hour');
        const minute = get('minute');
        const dayPeriod = get('dayPeriod');
        const tzName = get('timeZoneName');

        if (!year || !month || !day || !hour || !minute) {
            return null;
        }

        if (hour12) {
            const displayHour = hour.startsWith('0') ? hour.slice(1) : hour;
            const normalizedDayPeriod = dayPeriod ? normalizeDayPeriod(dayPeriod) : '';
            const time = `${displayHour}:${minute}${normalizedDayPeriod ? ` ${normalizedDayPeriod}` : ''}`;
            return compact
                ? `${month}-${day} ${time}`
                : `${year}-${month}-${day} ${time} ${tzName}`;
        }

        return compact
            ? `${month}-${day} ${hour}:${minute}`
            : `${year}-${month}-${day} ${hour}:${minute} ${tzName}`;
    } catch {
        return null;
    }
}

export function formatUsageResetAt(
    resetAt: string | undefined,
    compact = false,
    timezone?: string,
    localeOrHour12?: string | boolean,
    hour12Arg = false
): string | null {
    if (!resetAt) {
        return null;
    }

    const resetAtMs = Date.parse(resetAt);
    if (Number.isNaN(resetAtMs)) {
        return null;
    }

    const date = new Date(resetAtMs);
    const locale = typeof localeOrHour12 === 'string' ? localeOrHour12 : undefined;
    const hour12 = typeof localeOrHour12 === 'boolean' ? localeOrHour12 : hour12Arg;

    if (!timezone || timezone === 'UTC') {
        return formatResetAtUtc(date, compact, hour12);
    }

    const resolvedTimezone = timezone === 'local' ? undefined : timezone;
    const resolvedLocale = locale && locale.length > 0 ? locale : DEFAULT_TZ_LOCALE;
    const localized = formatResetAtInTimezone(date, compact, resolvedTimezone, resolvedLocale, hour12);
    if (localized) {
        return localized;
    }

    if (resolvedLocale !== DEFAULT_TZ_LOCALE) {
        const fallback = formatResetAtInTimezone(date, compact, resolvedTimezone, DEFAULT_TZ_LOCALE, hour12);
        if (fallback) {
            return fallback;
        }
    }

    return formatResetAtUtc(date, compact, hour12);
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
