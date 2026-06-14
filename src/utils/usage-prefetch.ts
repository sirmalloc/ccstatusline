import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';

import type { UsageData } from './usage';
import { fetchUsageData } from './usage';

type UsageDataField = Exclude<keyof UsageData, 'error'>;

const USAGE_WIDGET_TYPES = new Set<string>([
    'session-usage',
    'weekly-usage',
    'weekly-sonnet-usage',
    'weekly-opus-usage',
    'block-timer',
    'reset-timer',
    'weekly-reset-timer',
    'extra-usage-utilization',
    'extra-usage-remaining',
    'extra-usage-used'
]);

const USAGE_DATA_FIELDS: UsageDataField[] = [
    'sessionUsage',
    'sessionResetAt',
    'weeklyUsage',
    'weeklyResetAt',
    'weeklySonnetUsage',
    'weeklySonnetResetAt',
    'weeklyOpusUsage',
    'weeklyOpusResetAt',
    'extraUsageEnabled',
    'extraUsageLimit',
    'extraUsageUsed',
    'extraUsageUtilization',
    'extraUsageCurrency'
];

interface UsageFieldRequirement {
    alternatives?: UsageDataField[];
    field: UsageDataField;
}

const EMPTY_USAGE_REQUIREMENTS: UsageFieldRequirement[] = [];

const USAGE_WIDGET_REQUIREMENTS: Record<string, UsageFieldRequirement[]> = {
    'session-usage': [{ field: 'sessionUsage' }],
    'weekly-usage': [{ field: 'weeklyUsage' }],
    'weekly-sonnet-usage': [{ field: 'weeklySonnetUsage' }],
    'weekly-opus-usage': [{ field: 'weeklyOpusUsage' }],
    'block-timer': [{ field: 'sessionResetAt' }],
    'reset-timer': [{ field: 'sessionResetAt' }],
    'weekly-reset-timer': [{ field: 'weeklyResetAt' }],
    'extra-usage-utilization': [
        { field: 'extraUsageEnabled' },
        { field: 'extraUsageUtilization' }
    ],
    'extra-usage-remaining': [
        { field: 'extraUsageEnabled' },
        { field: 'extraUsageLimit' },
        { field: 'extraUsageUsed' }
    ],
    'extra-usage-used': [
        { field: 'extraUsageEnabled' },
        { field: 'extraUsageUsed' }
    ]
};

const USAGE_CURSOR_REQUIREMENTS: Record<string, UsageFieldRequirement> = {
    'session-usage': { field: 'sessionResetAt' },
    'weekly-usage': { field: 'weeklyResetAt' },
    'weekly-sonnet-usage': { field: 'weeklySonnetResetAt', alternatives: ['weeklyResetAt'] },
    'weekly-opus-usage': { field: 'weeklyOpusResetAt', alternatives: ['weeklyResetAt'] }
};

export function hasUsageDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => USAGE_WIDGET_TYPES.has(item.type)));
}

function isUsageCursorEnabled(item: WidgetItem): boolean {
    return item.metadata?.cursor === 'true';
}

function getUsageFieldRequirements(lines: WidgetItem[][]): UsageFieldRequirement[] {
    const requirements: UsageFieldRequirement[] = [];

    for (const line of lines) {
        for (const item of line) {
            requirements.push(...(USAGE_WIDGET_REQUIREMENTS[item.type] ?? EMPTY_USAGE_REQUIREMENTS));

            const cursorRequirement = USAGE_CURSOR_REQUIREMENTS[item.type];
            if (cursorRequirement && isUsageCursorEnabled(item)) {
                requirements.push(cursorRequirement);
            }
        }
    }

    return requirements;
}

function hasUsageDataField(data: UsageData | null | undefined, field: UsageDataField): boolean {
    return data?.[field] !== undefined;
}

function isUsageRequirementSatisfied(data: UsageData | null, requirement: UsageFieldRequirement): boolean {
    if (hasUsageDataField(data, requirement.field)) {
        return true;
    }

    return requirement.alternatives?.some(field => hasUsageDataField(data, field)) ?? false;
}

function getMissingFetchFields(data: UsageData | null, requirements: UsageFieldRequirement[]): UsageDataField[] {
    const missing = new Set<UsageDataField>();

    for (const requirement of requirements) {
        if (!isUsageRequirementSatisfied(data, requirement)) {
            missing.add(requirement.field);
        }
    }

    return Array.from(missing);
}

function hasAnyUsageDataField(data: UsageData | null | undefined): boolean {
    return USAGE_DATA_FIELDS.some(field => data?.[field] !== undefined);
}

function pickDefinedUsageFields(data: UsageData | null | undefined): Partial<UsageData> {
    return {
        ...(data?.sessionUsage !== undefined ? { sessionUsage: data.sessionUsage } : {}),
        ...(data?.sessionResetAt !== undefined ? { sessionResetAt: data.sessionResetAt } : {}),
        ...(data?.weeklyUsage !== undefined ? { weeklyUsage: data.weeklyUsage } : {}),
        ...(data?.weeklyResetAt !== undefined ? { weeklyResetAt: data.weeklyResetAt } : {}),
        ...(data?.weeklySonnetUsage !== undefined ? { weeklySonnetUsage: data.weeklySonnetUsage } : {}),
        ...(data?.weeklySonnetResetAt !== undefined ? { weeklySonnetResetAt: data.weeklySonnetResetAt } : {}),
        ...(data?.weeklyOpusUsage !== undefined ? { weeklyOpusUsage: data.weeklyOpusUsage } : {}),
        ...(data?.weeklyOpusResetAt !== undefined ? { weeklyOpusResetAt: data.weeklyOpusResetAt } : {}),
        ...(data?.extraUsageEnabled !== undefined ? { extraUsageEnabled: data.extraUsageEnabled } : {}),
        ...(data?.extraUsageLimit !== undefined ? { extraUsageLimit: data.extraUsageLimit } : {}),
        ...(data?.extraUsageUsed !== undefined ? { extraUsageUsed: data.extraUsageUsed } : {}),
        ...(data?.extraUsageUtilization !== undefined ? { extraUsageUtilization: data.extraUsageUtilization } : {}),
        ...(data?.extraUsageCurrency !== undefined ? { extraUsageCurrency: data.extraUsageCurrency } : {})
    };
}

function mergeUsageData(rateLimitsData: UsageData | null, apiData: UsageData): UsageData {
    return {
        ...pickDefinedUsageFields(apiData),
        ...pickDefinedUsageFields(rateLimitsData),
        ...(apiData.error ? { error: apiData.error } : {})
    };
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

    // Note: rate_limits does not include extra_usage data (extraUsageEnabled, etc.).
    // Those fields are only available via the API fetch path.
    const usageData: UsageData = {
        sessionUsage,
        sessionResetAt,
        weeklyUsage,
        weeklyResetAt,
        weeklySonnetUsage,
        weeklySonnetResetAt,
        weeklyOpusUsage,
        weeklyOpusResetAt
    };

    return hasAnyUsageDataField(usageData) ? usageData : null;
}

export async function prefetchUsageDataIfNeeded(lines: WidgetItem[][], data?: StatusJSON): Promise<UsageData | null> {
    if (!hasUsageDependentWidgets(lines)) {
        return null;
    }

    const rateLimitsData = extractUsageDataFromRateLimits(data?.rate_limits);
    const requirements = getUsageFieldRequirements(lines);
    const missingFields = getMissingFetchFields(rateLimitsData, requirements);

    if (missingFields.length === 0) {
        return rateLimitsData;
    }

    const apiData = await fetchUsageData({ requiredFields: missingFields });
    return mergeUsageData(rateLimitsData, apiData);
}
