import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import * as usage from '../usage';
import {
    extractUsageDataFromRateLimits,
    hasUsageDependentWidgets,
    prefetchUsageDataIfNeeded
} from '../usage-prefetch';
import type { UsageData } from '../usage-types';

function makeLines(...lineItems: WidgetItem[][]): WidgetItem[][] {
    return lineItems;
}

describe('usage prefetch', () => {
    let mockFetchUsageData: {
        mock: { calls: unknown[][] };
        mockResolvedValue: (value: UsageData) => void;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetchUsageData = vi.spyOn(usage, 'fetchUsageData');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        {
            expected: true,
            lines: makeLines(
                [{ id: '1', type: 'model' }],
                [{ id: '2', type: 'block-timer' }]
            ),
            name: 'detects when usage widgets are present'
        },
        {
            expected: false,
            lines: makeLines(
                [{ id: '1', type: 'model' }],
                [{ id: '2', type: 'git-branch' }]
            ),
            name: 'does not detect usage requirement for non-usage widgets'
        }
    ])('$name', ({ expected, lines }) => {
        expect(hasUsageDependentWidgets(lines)).toBe(expected);
    });

    it('fetches usage data once when at least one usage widget exists', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 12.3 });

        const lines = makeLines(
            [{ id: '1', type: 'model' }],
            [{ id: '2', type: 'session-usage' }, { id: '3', type: 'weekly-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines);

        expect(usageData).toEqual({ sessionUsage: 12.3 });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('does not fetch usage data when no usage widgets exist', async () => {
        const lines = makeLines(
            [{ id: '1', type: 'model' }],
            [{ id: '2', type: 'git-branch' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines);

        expect(usageData).toBeNull();
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('uses rate_limits from StatusJSON instead of fetching from API', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 99 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 23, resets_at: 1774008000 },
                seven_day: { used_percentage: 2, resets_at: 1774594800 }
            }
        });

        expect(usageData?.sessionUsage).toBe(23);
        expect(usageData?.weeklyUsage).toBe(2);
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('falls back to API fetch when rate_limits is absent', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 42 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {});

        expect(usageData).toEqual({ sessionUsage: 42 });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('falls back to API fetch when rate_limits has no usable percentages', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 42 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { resets_at: 1774008000 } } });

        expect(usageData).toEqual({ sessionUsage: 42 });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });
});

describe('extractUsageDataFromRateLimits', () => {
    it('extracts session and weekly usage from rate_limits', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 23, resets_at: 1774008000 },
            seven_day: { used_percentage: 2, resets_at: 1774594800 }
        });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBe(23);
        expect(result?.weeklyUsage).toBe(2);
    });

    it('converts epoch seconds to ISO strings for resets_at', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 23, resets_at: 1774008000 },
            seven_day: { used_percentage: 2, resets_at: 1774594800 }
        });

        expect(result?.sessionResetAt).toBe(new Date(1774008000 * 1000).toISOString());
        expect(result?.weeklyResetAt).toBe(new Date(1774594800 * 1000).toISOString());
    });

    it('returns null when rate_limits is null', () => {
        expect(extractUsageDataFromRateLimits(null)).toBeNull();
    });

    it('returns null when rate_limits is undefined', () => {
        expect(extractUsageDataFromRateLimits(undefined)).toBeNull();
    });

    it('returns null when both used_percentage values are missing', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { resets_at: 1774008000 } });

        expect(result).toBeNull();
    });

    it('extracts partial data when only five_hour is present', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: 50, resets_at: 1774008000 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBe(50);
        expect(result?.weeklyUsage).toBeUndefined();
    });

    it('extracts partial data when only seven_day is present', () => {
        const result = extractUsageDataFromRateLimits({ seven_day: { used_percentage: 10, resets_at: 1774594800 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBeUndefined();
        expect(result?.weeklyUsage).toBe(10);
    });

    it('treats used_percentage of 0 as valid data', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: 0, resets_at: 1774008000 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBe(0);
    });

    it('treats null used_percentage as missing and falls back', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: null, resets_at: 1774008000 } });

        expect(result).toBeNull();
    });
});