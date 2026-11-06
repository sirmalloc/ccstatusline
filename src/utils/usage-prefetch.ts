import type {
    RateLimitPeriod,
    StatusJSON
} from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';
import { isHidden } from '../widgets/shared/hideable';
import {
    SESSION_AT_LIMIT_HIDEABLE_STATE,
    SESSION_UNDER_LIMIT_HIDEABLE_STATE
} from '../widgets/shared/usage-display';

import { observeExtraUsageSpend } from './daily-spend';
import type { UsageData } from './usage';
import {
    fetchUsageData,
    getUsageAccountKey,
    getUsageFetchedAtMs,
    isStaleUsageFallback,
    lookUpUsageAccount
} from './usage';
import type { UsageDataField } from './usage-types';
import {
    WEEKLY_MODEL_USAGE_BUCKETS,
    setUsageField
} from './usage-types';

// Non-model usage widgets/fields. The per-model ones (weekly-sonnet-usage,
// weekly-opus-usage, ...) are derived below from WEEKLY_MODEL_USAGE_BUCKETS so
// that adding a model bucket can't desync one of these tables from the others.
const BASE_USAGE_WIDGET_TYPES = [
    'session-usage',
    'block-forecast',
    'block-limit-timer',
    'weekly-usage',
    'weekly-limit-timer',
    'fable-weekly-limit-timer',
    'block-timer',
    'reset-timer',
    'weekly-reset-timer',
    'extra-usage-utilization',
    'extra-usage-remaining',
    'extra-usage-used',
    'extra-usage-limit',
    'extra-usage-daily-budget',
    'extra-usage-today',
    'spend-limit-usage',
    'spend-limit-amount'
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
    'spendLimitUsage',
    'spendLimitUsedUsd',
    'spendLimitLimitUsd',
    'extraUsageEnabled',
    'extraUsageLimit',
    'extraUsageUsed',
    'extraUsageUtilization',
    'extraUsageCurrency'
];

interface UsageFieldRequirement {
    alternatives?: UsageDataField[];
    field: UsageDataField;
    // Fetch the field from the usage API even when the payload has it
    fromApi?: boolean;
    suppressFetchError?: boolean;
}

const EMPTY_USAGE_REQUIREMENTS: UsageFieldRequirement[] = [];

// The spend limit widgets have no entry here on purpose: rate_limits.spend_limit
// only exists in the statusline payload, so a missing value must not trigger an
// OAuth usage fetch.
const USAGE_WIDGET_REQUIREMENTS: Record<string, UsageFieldRequirement[]> = {
    'session-usage': [{ field: 'sessionUsage' }],
    // The forecast widgets render nothing without data, so a failed fetch made only
    // for them isn't an error for the rest of the line.
    'block-forecast': [{ field: 'sessionUsage', suppressFetchError: true }, { field: 'sessionResetAt', suppressFetchError: true }],
    'block-limit-timer': [{ field: 'sessionUsage', suppressFetchError: true }, { field: 'sessionResetAt', suppressFetchError: true }],
    'weekly-limit-timer': [{ field: 'weeklyUsage', suppressFetchError: true }, { field: 'weeklyResetAt', suppressFetchError: true }],
    // Fable's window resets with the all-models one when the API sends no reset of its own
    'fable-weekly-limit-timer': [{ field: 'fableUsage', suppressFetchError: true }, { field: 'fableResetAt', alternatives: ['weeklyResetAt'], suppressFetchError: true }],
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
    ],
    'extra-usage-limit': [
        { field: 'extraUsageEnabled' },
        { field: 'extraUsageLimit' }
    ],
    'extra-usage-daily-budget': [
        { field: 'extraUsageEnabled' },
        { field: 'extraUsageLimit' },
        { field: 'extraUsageUsed' }
    ],
    'extra-usage-today': [
        { field: 'extraUsageEnabled' },
        { field: 'extraUsageUsed' }
    ]
};

const SPEND_TODAY_WIDGET_TYPES = new Set<string>(['extra-usage-today']);

function needsSpendToday(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => SPEND_TODAY_WIDGET_TYPES.has(item.type)));
}

// Today's spend needs the month-to-date total, the login it belongs to (the
// daily state file keeps each login's start-of-day total separately), and when
// the usage API returned it: a cached total fetched before midnight is not
// today's. The login's token fingerprint changes each time Claude Code
// refreshes its tokens, so the record is kept under the account the profile
// lookup names, and under the fingerprint only until that lookup answers.
async function withSpendToday(data: UsageData, lines: WidgetItem[][]): Promise<UsageData> {
    if (!needsSpendToday(lines) || data.extraUsageUsed === undefined) {
        return data;
    }

    const accountKey = getUsageAccountKey();
    const fetchedAtMs = getUsageFetchedAtMs();
    if (accountKey === null || fetchedAtMs === undefined) {
        return data;
    }

    const account = await lookUpUsageAccount();
    const spentToday = account
        ? observeExtraUsageSpend(account.key, data.extraUsageUsed, fetchedAtMs, undefined, account.fingerprints)
        : observeExtraUsageSpend(accountKey, data.extraUsageUsed, fetchedAtMs);
    return spentToday === undefined ? data : { ...data, extraUsageUsedToday: spentToday };
}

const USAGE_CURSOR_REQUIREMENTS: Record<string, UsageFieldRequirement> = {
    'session-usage': { field: 'sessionResetAt' },
    'weekly-usage': { field: 'weeklyResetAt' },
    ...Object.fromEntries(WEEKLY_MODEL_USAGE_BUCKETS.map(bucket => [bucket.widgetType, { field: bucket.resetField, alternatives: ['weeklyResetAt'] }]))
};

// Block Reset Timer's under-limit and Block Usage's at-limit hide states read
// the 5-hour block's percent from the usage API, kept as apiSessionUsage. The
// payload's percent comes from this session's last response, so in a session
// left idle while others use up the limit it never reaches 100%. Like the
// timer's own reset requirement, a failed fetch made only for it isn't an
// error, and the payload's percent stands in.
const SESSION_LIMIT_HIDE_REQUIREMENT: UsageFieldRequirement = { field: 'sessionUsage', fromApi: true, suppressFetchError: true };

function readsSessionLimit(item: WidgetItem): boolean {
    return (item.type === 'reset-timer' && isHidden(item, SESSION_UNDER_LIMIT_HIDEABLE_STATE.key))
        || (item.type === 'session-usage' && isHidden(item, SESSION_AT_LIMIT_HIDEABLE_STATE.key));
}

// A cached answer can outlive its block: the cache is reused for minutes, and
// for as long as the API keeps failing. Once its block has reset, its percent
// says nothing about the current one.
function isFromCurrentBlock(apiData: UsageData): boolean {
    const resetAtMs = apiData.sessionResetAt === undefined ? Number.NaN : Date.parse(apiData.sessionResetAt);
    return Number.isNaN(resetAtMs) || resetAtMs > Date.now();
}

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

            if (readsSessionLimit(item)) {
                requirements.push(SESSION_LIMIT_HIDE_REQUIREMENT);
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
        if (requirement.fromApi || !isUsageRequirementSatisfied(data, requirement)) {
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

// A null legacy per-model bucket is ambiguous: migrated accounts can report it
// alongside an authoritative weekly_scoped API limit. Keep it unset here so
// prefetching checks the API before parseUsageApiResponse applies its legacy
// null-bucket fallback.
function getRateLimitBucketUsage(bucket: RateLimitPeriod | null | undefined): number | undefined {
    return bucket?.used_percentage ?? undefined;
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
        weeklyResetAt: epochSecondsToIsoString(rateLimits.seven_day?.resets_at),
        spendLimitUsage: rateLimits.spend_limit?.used_percentage ?? undefined,
        spendLimitUsedUsd: rateLimits.spend_limit?.used_usd ?? undefined,
        spendLimitLimitUsd: rateLimits.spend_limit?.limit_usd ?? undefined
        // Note: rate_limits does not include extra_usage data (extraUsageEnabled, etc.).
        // Those fields are only available via the API fetch path.
    };

    for (const bucket of WEEKLY_MODEL_USAGE_BUCKETS) {
        if (!bucket.apiBucketKey) {
            continue;
        }

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
        return hasAnyUsageDataField(apiData)
            ? mergeUsageData(rateLimitsData, { ...apiData, error: undefined })
            : rateLimitsData;
    }

    const usageData = mergeUsageData(rateLimitsData, apiData);
    // A stale fallback is the last good cache, served while the API can't be reached
    // once it has outlived a refresh, so like a failed fetch it leaves the payload's percent to decide
    if (requirements.includes(SESSION_LIMIT_HIDE_REQUIREMENT) && apiData.sessionUsage !== undefined && isFromCurrentBlock(apiData) && !isStaleUsageFallback(apiData)) {
        usageData.apiSessionUsage = apiData.sessionUsage;
    }
    return withSpendToday(usageData, lines);
}
