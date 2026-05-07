import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';

import type { UsageData } from './usage';
import { fetchUsageData } from './usage';

const USAGE_WIDGET_TYPES = new Set<string>([
    'session-usage',
    'weekly-usage',
    'weekly-sonnet-usage',
    'weekly-opus-usage',
    'block-timer',
    'reset-timer',
    'weekly-reset-timer'
]);

const PER_MODEL_USAGE_WIDGET_TYPES = new Set<string>([
    'weekly-sonnet-usage',
    'weekly-opus-usage'
]);

export function hasUsageDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => USAGE_WIDGET_TYPES.has(item.type)));
}

function hasPerModelUsageWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => PER_MODEL_USAGE_WIDGET_TYPES.has(item.type)));
}

function epochSecondsToIsoString(epochSeconds: number | null | undefined): string | undefined {
    if (epochSeconds === null || epochSeconds === undefined || !Number.isFinite(epochSeconds)) {
        return undefined;
    }
    return new Date(epochSeconds * 1000).toISOString();
}

export function extractUsageDataFromRateLimits(rateLimits: StatusJSON['rate_limits']): UsageData | null {
    if (!rateLimits) {
        return null;
    }

    const sessionUsage = rateLimits.five_hour?.used_percentage ?? undefined;
    const sessionResetAt = epochSecondsToIsoString(rateLimits.five_hour?.resets_at);
    const weeklyUsage = rateLimits.seven_day?.used_percentage ?? undefined;
    const weeklyResetAt = epochSecondsToIsoString(rateLimits.seven_day?.resets_at);
    const weeklySonnetUsage = rateLimits.seven_day_sonnet?.used_percentage ?? undefined;
    const weeklySonnetResetAt = epochSecondsToIsoString(rateLimits.seven_day_sonnet?.resets_at);
    const weeklyOpusUsage = rateLimits.seven_day_opus?.used_percentage ?? undefined;
    const weeklyOpusResetAt = epochSecondsToIsoString(rateLimits.seven_day_opus?.resets_at);

    if (sessionUsage === undefined && weeklyUsage === undefined) {
        return null;
    }

    // Note: rate_limits does not include extra_usage data (extraUsageEnabled, etc.).
    // Those fields are only available via the API fetch path.
    return {
        sessionUsage,
        sessionResetAt,
        weeklyUsage,
        weeklyResetAt,
        weeklySonnetUsage,
        weeklySonnetResetAt,
        weeklyOpusUsage,
        weeklyOpusResetAt
    };
}

function hasCompleteRateLimitsUsageData(
    usageData: UsageData | null,
    perModelRequired: boolean
): usageData is UsageData & {
    sessionUsage: number;
    sessionResetAt: string;
    weeklyUsage: number;
    weeklyResetAt: string;
} {
    if (
        usageData?.sessionUsage === undefined
        || usageData.sessionResetAt === undefined
        || usageData.weeklyUsage === undefined
        || usageData.weeklyResetAt === undefined
    ) {
        return false;
    }

    // Per-model buckets can legitimately be absent (the user may not have used Opus,
    // or the host Claude Code may be on a release that doesn't surface them yet).
    // Only require that *something* — usage or reset — has been populated for
    // per-model fields when a per-model widget is on screen, so we don't fall
    // back to the API on every render.
    if (perModelRequired) {
        const sonnetPresent = usageData.weeklySonnetUsage !== undefined || usageData.weeklySonnetResetAt !== undefined;
        const opusPresent = usageData.weeklyOpusUsage !== undefined || usageData.weeklyOpusResetAt !== undefined;
        if (!sonnetPresent && !opusPresent) {
            return false;
        }
    }

    return true;
}

export async function prefetchUsageDataIfNeeded(lines: WidgetItem[][], data?: StatusJSON): Promise<UsageData | null> {
    if (!hasUsageDependentWidgets(lines)) {
        return null;
    }

    const rateLimitsData = extractUsageDataFromRateLimits(data?.rate_limits);
    if (hasCompleteRateLimitsUsageData(rateLimitsData, hasPerModelUsageWidgets(lines))) {
        return rateLimitsData;
    }

    return fetchUsageData();
}
