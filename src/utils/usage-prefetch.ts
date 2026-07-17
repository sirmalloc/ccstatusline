import type {
    RateLimitPeriod,
    StatusJSON
} from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';

import type { UsageData } from './usage';
import { fetchUsageData } from './usage';
import type { UsageDataField } from './usage-types';
import { WEEKLY_MODEL_USAGE_BUCKETS } from './usage-types';

// Non-model usage widgets/fields. The per-model ones (weekly-sonnet-usage,
// weekly-opus-usage, ...) are derived below from WEEKLY_MODEL_USAGE_BUCKETS so
// that adding a model bucket can't desync one of these tables from the others.
const BASE_USAGE_WIDGET_TYPES = [
    'session-usage',
    'weekly-usage',
    'block-timer',
    'reset-timer',
    'weekly-reset-timer',
    'extra-usage-utilization',
    'extra-usage-remaining',
    'extra-usage-used'
];

const USAGE_WIDGET_TYPES = new Set<string>([
    ...BASE_USAGE_WIDGET_TYPES,
    ...WEEKLY_MODEL_USAGE_BUCKETS.map(bucket => bucket.widgetType)
]);

const USAGE_DATA_FIELDS: UsageDataField[] = [
    'sessionUsage',
    'sessionResetAt',
    'weeklyUsage',
    'weeklyResetAt',
    ...WEEKLY_MODEL_USAGE_BUCKETS.flatMap(bucket => [bucket.usageField, bucket.resetField]),
    'extraUsageEnabled',
    'extraUsageLimit',
    'extraUsageUsed',
    'extraUsageUtilization',
    'extraUsageCurrency'
];

interface UsageFieldRequirement {
    alternatives?: UsageDataField[];
    field: UsageDataField;
    suppressFetchError?: boolean;
}

const EMPTY_USAGE_REQUIREMENTS: UsageFieldRequirement[] = [];

const USAGE_WIDGET_REQUIREMENTS: Record<string, UsageFieldRequirement[]> = {
    'session-usage': [{ field: 'sessionUsage' }],
    'weekly-usage': [{ field: 'weeklyUsage' }],
    ...Object.fromEntries(WEEKLY_MODEL_USAGE_BUCKETS.map(bucket => [bucket.widgetType, [{ field: bucket.usageField }]])),
    'block-timer': [{ field: 'sessionResetAt', suppressFetchError: true }],
    'reset-timer': [{ field: 'sessionResetAt', suppressFetchError: true }],
    'weekly-reset-timer': [{ field: 'weeklyResetAt', suppressFetchError: true }],
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
    ...Object.fromEntries(WEEKLY_MODEL_USAGE_BUCKETS.map(bucket => [bucket.widgetType, { field: bucket.resetField, alternatives: ['weeklyResetAt'] }]))
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

function getMissingFetchRequirements(
    data: UsageData | null,
    requirements: UsageFieldRequirement[]
): { fields: UsageDataField[]; suppressFetchError: boolean } {
    const missing = new Set<UsageDataField>();
    let hasUnsuppressedMissingRequirement = false;

    for (const requirement of requirements) {
        if (!isUsageRequirementSatisfied(data, requirement)) {
            missing.add(requirement.field);
            if (!requirement.suppressFetchError) {
                hasUnsuppressedMissingRequirement = true;
            }
        }
    }

    return {
        fields: Array.from(missing),
        suppressFetchError: missing.size > 0 && !hasUnsuppressedMissingRequirement
    };
}

function hasAnyUsageDataField(data: UsageData | null | undefined): boolean {
    return USAGE_DATA_FIELDS.some(field => data?.[field] !== undefined);
}

// TypeScript can't narrow `target[field] = value` when `field` is a plain
// `UsageDataField` union at the call site (it can't prove `value`'s type
// matches whichever member of the union `field` happens to be), but it can
// when both are tied to the same generic `K` here.
function setUsageField<K extends UsageDataField>(target: Partial<UsageData>, field: K, value: UsageData[K]): void {
    target[field] = value;
}

function pickDefinedUsageFields(data: UsageData | null | undefined): Partial<UsageData> {
    const picked: Partial<UsageData> = {};

    for (const field of USAGE_DATA_FIELDS) {
        const value = data?.[field];
        if (value !== undefined) {
            setUsageField(picked, field, value);
        }
    }

    return picked;
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

// A null bucket (Enterprise accounts have no per-model rate-limit windows,
// mirroring the #343 handling for the overall windows) parses to 0 usage with
// no resets_at, distinct from "the key was absent" (undefined -> unset).
function getRateLimitBucketUsage(bucket: RateLimitPeriod | null | undefined): number | undefined {
    return bucket === null ? 0 : bucket?.used_percentage ?? undefined;
}

export function extractUsageDataFromRateLimits(rateLimits: StatusJSON['rate_limits']): UsageData | null {
    if (!rateLimits) {
        return null;
    }

    // rate_limits is keyed by fixed, schema-declared bucket names (five_hour,
    // seven_day, seven_day_sonnet, ...); WEEKLY_MODEL_USAGE_BUCKETS.apiBucketKey
    // values are those same names, kept in sync via the schema-parity test in
    // usage-fetch.test.ts, so this lookup is safe despite the untyped index.
    const rateLimitBuckets = rateLimits as unknown as Record<string, RateLimitPeriod | null | undefined>;

    const usageData: UsageData = {
        sessionUsage: rateLimits.five_hour?.used_percentage ?? undefined,
        sessionResetAt: epochSecondsToIsoString(rateLimits.five_hour?.resets_at),
        weeklyUsage: rateLimits.seven_day?.used_percentage ?? undefined,
        weeklyResetAt: epochSecondsToIsoString(rateLimits.seven_day?.resets_at)
        // Note: rate_limits does not include extra_usage data (extraUsageEnabled, etc.).
        // Those fields are only available via the API fetch path.
    };

    for (const bucket of WEEKLY_MODEL_USAGE_BUCKETS) {
        const rateLimitBucket = rateLimitBuckets[bucket.apiBucketKey];
        setUsageField(usageData, bucket.usageField, getRateLimitBucketUsage(rateLimitBucket));
        setUsageField(usageData, bucket.resetField, epochSecondsToIsoString(rateLimitBucket?.resets_at));
    }

    return hasAnyUsageDataField(usageData) ? usageData : null;
}

export async function prefetchUsageDataIfNeeded(lines: WidgetItem[][], data?: StatusJSON): Promise<UsageData | null> {
    if (!hasUsageDependentWidgets(lines)) {
        return null;
    }

    const rateLimitsData = extractUsageDataFromRateLimits(data?.rate_limits);
    const requirements = getUsageFieldRequirements(lines);
    const missingRequirements = getMissingFetchRequirements(rateLimitsData, requirements);
    const missingFields = missingRequirements.fields;

    if (missingFields.length === 0) {
        return rateLimitsData;
    }

    const apiData = await fetchUsageData({ requiredFields: missingFields });
    if (apiData.error && missingRequirements.suppressFetchError) {
        return rateLimitsData;
    }

    return mergeUsageData(rateLimitsData, apiData);
}
