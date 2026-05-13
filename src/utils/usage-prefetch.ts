import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';

import type { UsageData } from './usage';
import { fetchUsageData } from './usage';

const USAGE_WIDGET_TYPES = new Set<string>([
    'session-usage',
    'weekly-usage',
    'weekly-sonnet-usage',
    'weekly-opus-usage',
    'weekly-budget-buffer',
    'block-timer',
    'reset-timer',
    'weekly-reset-timer'
]);

const PER_MODEL_USAGE_WIDGET_TYPES = new Set<string>([
    'weekly-sonnet-usage',
    'weekly-opus-usage'
]);

interface PerModelUsageRequirements {
    opus: boolean;
    sonnet: boolean;
}

export function hasUsageDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => USAGE_WIDGET_TYPES.has(item.type)));
}

function getPerModelUsageRequirements(lines: WidgetItem[][]): PerModelUsageRequirements {
    const requirements: PerModelUsageRequirements = {
        opus: false,
        sonnet: false
    };

    for (const line of lines) {
        for (const item of line) {
            if (!PER_MODEL_USAGE_WIDGET_TYPES.has(item.type)) {
                continue;
            }

            if (item.type === 'weekly-sonnet-usage') {
                requirements.sonnet = true;
            } else if (item.type === 'weekly-opus-usage') {
                requirements.opus = true;
            }
        }
    }

    return requirements;
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
    const weeklySonnetUsage = rateLimits.seven_day_sonnet === null ? 0 : rateLimits.seven_day_sonnet?.used_percentage ?? undefined;
    const weeklySonnetResetAt = epochSecondsToIsoString(rateLimits.seven_day_sonnet?.resets_at);
    const weeklyOpusUsage = rateLimits.seven_day_opus === null ? 0 : rateLimits.seven_day_opus?.used_percentage ?? undefined;
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
    perModelRequirements: PerModelUsageRequirements
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

    if (perModelRequirements.sonnet && usageData.weeklySonnetUsage === undefined) {
        return false;
    }

    if (perModelRequirements.opus && usageData.weeklyOpusUsage === undefined) {
        return false;
    }

    return true;
}

function getRequiredUsageFields(perModelRequirements: PerModelUsageRequirements): ('weeklySonnetUsage' | 'weeklyOpusUsage')[] {
    const requiredFields: ('weeklySonnetUsage' | 'weeklyOpusUsage')[] = [];

    if (perModelRequirements.sonnet) {
        requiredFields.push('weeklySonnetUsage');
    }

    if (perModelRequirements.opus) {
        requiredFields.push('weeklyOpusUsage');
    }

    return requiredFields;
}

export async function prefetchUsageDataIfNeeded(lines: WidgetItem[][], data?: StatusJSON): Promise<UsageData | null> {
    if (!hasUsageDependentWidgets(lines)) {
        return null;
    }

    const rateLimitsData = extractUsageDataFromRateLimits(data?.rate_limits);
    const perModelRequirements = getPerModelUsageRequirements(lines);
    if (hasCompleteRateLimitsUsageData(rateLimitsData, perModelRequirements)) {
        return rateLimitsData;
    }

    return fetchUsageData({ requiredFields: getRequiredUsageFields(perModelRequirements) });
}
