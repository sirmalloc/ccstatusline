import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { StatusJSON } from '../../types/StatusJSON';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { BlockResetTimerWidget } from '../../widgets/BlockResetTimer';
import { SessionUsageWidget } from '../../widgets/SessionUsage';
import { WeeklyUsageWidget } from '../../widgets/WeeklyUsage';
import * as dailySpend from '../daily-spend';
import {
    extractUsageDataFromRateLimits,
    hasUsageDependentWidgets,
    prefetchUsageDataIfNeeded
} from '../usage-prefetch';
import type { UsageData } from '../usage-types';

function makeLines(...lineItems: WidgetItem[][]): WidgetItem[][] {
    return lineItems;
}

function epochToIso(epochSeconds: number): string {
    return new Date(epochSeconds * 1000).toISOString();
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
        vi.useRealTimers();
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
            expected: true,
            lines: makeLines(
                [{ id: '1', type: 'model' }],
                [{ id: '2', type: 'extra-usage-remaining' }]
            ),
            name: 'detects when extra usage widgets are present'
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
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(usageData?.sessionUsage).toBe(42);
        expect(usageData?.weeklyUsage).toBe(15);
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

    it('merges reset-only rate_limits data with API usage data', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 42 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { resets_at: 1774020000 } } });

        expect(usageData).toEqual({
            sessionUsage: 42,
            sessionResetAt: epochToIso(1774020000)
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('merges API weekly data under partial statusline data', async () => {
        mockFetchUsageData.mockResolvedValue({
            sessionUsage: 99,
            sessionResetAt: '2026-03-20T12:00:00.000Z',
            weeklyUsage: 10,
            weeklyResetAt: '2026-03-27T12:00:00.000Z'
        });

        const lines = makeLines(
            [{ id: '1', type: 'weekly-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 50, resets_at: 1774020000 } } });

        expect(usageData).toEqual({
            sessionUsage: 50,
            sessionResetAt: epochToIso(1774020000),
            weeklyUsage: 10,
            weeklyResetAt: '2026-03-27T12:00:00.000Z'
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('uses per-model rate_limits buckets when a per-model widget is present', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 99 });

        const lines = makeLines(
            [{ id: '1', type: 'weekly-sonnet-usage' }, { id: '2', type: 'weekly-opus-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 },
                seven_day_sonnet: { used_percentage: 8, resets_at: 1774540001 },
                seven_day_opus: { used_percentage: 2, resets_at: 1774540002 }
            }
        });

        expect(usageData?.weeklySonnetUsage).toBe(8);
        expect(usageData?.weeklyOpusUsage).toBe(2);
        expect(usageData?.weeklySonnetResetAt).toBe(new Date(1774540001 * 1000).toISOString());
        expect(usageData?.weeklyOpusResetAt).toBe(new Date(1774540002 * 1000).toISOString());
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('falls back to API fetch when per-model widget is present but rate_limits lacks per-model buckets', async () => {
        mockFetchUsageData.mockResolvedValue({
            sessionUsage: 42,
            sessionResetAt: '2026-03-20T12:00:00.000Z',
            weeklyUsage: 15,
            weeklyResetAt: '2026-03-27T12:00:00.000Z',
            weeklySonnetUsage: 8,
            weeklySonnetResetAt: '2026-03-27T12:00:00.000Z'
        });

        const lines = makeLines(
            [{ id: '1', type: 'weekly-sonnet-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(usageData?.weeklySonnetUsage).toBe(8);
        expect(usageData?.sessionUsage).toBe(42);
        expect(usageData?.sessionResetAt).toBe(epochToIso(1774020000));
        expect(usageData?.weeklyUsage).toBe(15);
        expect(usageData?.weeklyResetAt).toBe(epochToIso(1774540000));
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('triggers API fetch for fable-weekly-usage even when stdin rate_limits is fully populated', async () => {
        mockFetchUsageData.mockResolvedValue({
            sessionUsage: 42,
            sessionResetAt: '2026-03-20T12:00:00.000Z',
            weeklyUsage: 15,
            weeklyResetAt: '2026-03-27T12:00:00.000Z',
            fableUsage: 5,
            fableResetAt: '2026-03-27T12:00:00.000Z'
        });

        const lines = makeLines(
            [{ id: '1', type: 'fable-weekly-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(usageData?.fableUsage).toBe(5);
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
        expect(mockFetchUsageData.mock.calls[0]).toEqual([{ requiredFields: ['fableUsage'] }]);
    });

    it.each([
        {
            apiUsageData: { weeklySonnetUsage: 8 },
            bucketName: 'seven_day_sonnet' as const,
            expectedUsage: 8,
            usageField: 'weeklySonnetUsage' as const,
            widgetType: 'weekly-sonnet-usage'
        },
        {
            apiUsageData: { weeklyOpusUsage: 2 },
            bucketName: 'seven_day_opus' as const,
            expectedUsage: 2,
            usageField: 'weeklyOpusUsage' as const,
            widgetType: 'weekly-opus-usage'
        }
    ])('falls back to API fetch when $widgetType has only a reset timestamp in rate_limits', async ({
        apiUsageData,
        bucketName,
        expectedUsage,
        usageField,
        widgetType
    }) => {
        mockFetchUsageData.mockResolvedValue({
            sessionUsage: 42,
            sessionResetAt: '2026-03-20T12:00:00.000Z',
            weeklyUsage: 15,
            weeklyResetAt: '2026-03-27T12:00:00.000Z',
            ...apiUsageData
        });

        const lines = makeLines(
            [{ id: '1', type: widgetType }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 },
                [bucketName]: { resets_at: 1774540001 }
            }
        });

        expect(usageData?.[usageField]).toBe(expectedUsage);
        expect(usageData?.weeklySonnetResetAt ?? usageData?.weeklyOpusResetAt).toBe(epochToIso(1774540001));
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('uses reset-only rate_limits data without fetching for reset timer widgets', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'no-credentials' });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionResetAt: epochToIso(1774020000) });
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('renders valid weekly usage when the shared response reports an expired session window', async () => {
        const partial: UsageData = { weeklyUsage: 40, weeklyResetAt: '2030-01-07T00:00:00.000Z', error: 'rate-limited' };
        mockFetchUsageData.mockResolvedValue(partial);
        const session: WidgetItem = { id: 'session', type: 'session-usage' };
        const weekly: WidgetItem = { id: 'weekly', type: 'weekly-usage', rawValue: true };

        const usageData = await prefetchUsageDataIfNeeded([[session, weekly]]);

        expect(mockFetchUsageData.mock.calls).toEqual([[{ requiredFields: ['sessionUsage', 'weeklyUsage'] }]]);
        expect(usageData).toEqual(partial);
        const context = { isPreview: false, usageData: usageData ?? undefined };
        expect(new WeeklyUsageWidget().render(weekly, context, DEFAULT_SETTINGS)).toBe('40.0%');
        expect(new SessionUsageWidget().render(session, context, DEFAULT_SETTINGS)).toBe('[Rate limited]');
    });

    it('keeps valid reset data when suppressing an error for another expired window', async () => {
        const weeklyResetAt = '2030-01-07T00:00:00.000Z';
        mockFetchUsageData.mockResolvedValue({ weeklyUsage: 40, weeklyResetAt, error: 'rate-limited' });

        const usageData = await prefetchUsageDataIfNeeded(makeLines([
            { id: 'session', type: 'reset-timer' },
            { id: 'weekly', type: 'weekly-reset-timer' }
        ]));

        expect(mockFetchUsageData.mock.calls).toEqual([[{ requiredFields: ['sessionResetAt', 'weeklyResetAt'] }]]);
        expect(usageData).toEqual({ weeklyUsage: 40, weeklyResetAt });
    });

    it('suppresses API errors when reset timer widgets are only missing reset data', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(usageData).toEqual({
            sessionUsage: 42,
            weeklyUsage: 15,
            weeklyResetAt: epochToIso(1774540000)
        });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['sessionResetAt'] }]
        ]);
    });

    it('reads the forecast widgets\' data from rate_limits without fetching', async () => {
        const lines = makeLines(
            [{ id: '1', type: 'block-forecast' }, { id: '2', type: 'block-limit-timer' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 42, resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionUsage: 42, sessionResetAt: epochToIso(1774020000) });
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it.each(['block-forecast', 'block-limit-timer'])('fetches the reset time %s needs and keeps quiet when that fails', async (type) => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines([{ id: '1', type }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 42 } } });

        expect(usageData).toEqual({ sessionUsage: 42 });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['sessionResetAt'] }]
        ]);
    });

    it('reads Weekly Limit Timer\'s data from rate_limits without fetching', async () => {
        const lines = makeLines([{ id: '1', type: 'weekly-limit-timer' }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { seven_day: { used_percentage: 72, resets_at: 1776211200 } } });

        expect(usageData).toEqual({ weeklyUsage: 72, weeklyResetAt: epochToIso(1776211200) });
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('fetches the weekly reset time Weekly Limit Timer needs and keeps quiet when that fails', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines([{ id: '1', type: 'weekly-limit-timer' }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { seven_day: { used_percentage: 72 } } });

        expect(usageData).toEqual({ weeklyUsage: 72 });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['weeklyResetAt'] }]
        ]);
    });

    it('fetches Fable\'s percent for Weekly Fable Limit Timer, using the all-models reset when Fable has none', async () => {
        mockFetchUsageData.mockResolvedValue({ fableUsage: 8 });

        const lines = makeLines([{ id: '1', type: 'fable-weekly-limit-timer' }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { seven_day: { used_percentage: 72, resets_at: 1776211200 } } });

        expect(usageData).toEqual({ weeklyUsage: 72, weeklyResetAt: epochToIso(1776211200), fableUsage: 8 });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['fableUsage'] }]
        ]);
    });

    it('keeps quiet when the fetch made only for Weekly Fable Limit Timer fails', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines([{ id: '1', type: 'fable-weekly-limit-timer' }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { seven_day: { used_percentage: 72, resets_at: 1776211200 } } });

        expect(usageData).toEqual({ weeklyUsage: 72, weeklyResetAt: epochToIso(1776211200) });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['fableUsage'] }]
        ]);
    });

    it('returns no usage data instead of a rate-limit error for reset-only startup fetches', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines(
            [{ id: '1', type: 'weekly-reset-timer' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {});

        expect(usageData).toBeNull();
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['weeklyResetAt'] }]
        ]);
    });

    it('fetches the 5-hour block\'s percent for a reset timer that hides under the limit', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 100 });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { resets_at: 1774020000 } } });

        expect(usageData?.sessionUsage).toBe(100);
        expect(usageData?.apiSessionUsage).toBe(100);
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['sessionUsage'] }]
        ]);
    });

    it('suppresses API errors when the under-limit reset timer only misses the block\'s percent', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionResetAt: epochToIso(1774020000) });
    });

    it('fetches the under-limit reset timer\'s block percent even when rate_limits has one', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 100 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }],
            [{ id: '2', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 97, resets_at: 1774020000 } } });

        // The usage widgets keep the payload's percent; only the hide state reads the API's
        expect(usageData).toEqual({ sessionUsage: 97, sessionResetAt: epochToIso(1774020000), apiSessionUsage: 100 });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['sessionUsage'] }]
        ]);
    });

    it('ignores a cached block percent from a block that has already reset', async () => {
        // The API kept failing across the reset, so the cache still holds the old block's 100%
        vi.useFakeTimers({ now: (1774020000 + 20 * 60) * 1000, toFake: ['Date'] });
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 100, sessionResetAt: epochToIso(1774020000) });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 40, resets_at: 1774020000 + 5 * 60 * 60 } } });

        expect(usageData).toEqual({ sessionUsage: 40, sessionResetAt: epochToIso(1774020000 + 5 * 60 * 60) });
    });

    it.each(['expired', 'stale'] as const)('uses only the payload fallback to render under-limit timers with %s API data', async (cacheState) => {
        const now = 1774020000;
        const resetAt = now + 4 * 60 * 60;
        vi.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
        const apiData: UsageData = {
            sessionUsage: 100,
            sessionResetAt: epochToIso(cacheState === 'expired' ? now - 20 * 60 : resetAt)
        };
        mockFetchUsageData.mockResolvedValue(apiData);
        vi.spyOn(usage, 'isStaleUsageFallback').mockImplementation(data => cacheState === 'stale' && data === apiData);

        const item: WidgetItem = { id: 'reset', type: 'reset-timer', metadata: { hide: 'under-limit' } };
        const widget = new BlockResetTimerWidget();
        for (const percentage of [undefined, null, 0, 97, 100]) {
            const data: StatusJSON = { rate_limits: { five_hour: { used_percentage: percentage, resets_at: resetAt } } };
            const usageData = await prefetchUsageDataIfNeeded(makeLines([item]), data);

            // General usage data still merges API fields, but rejected API data
            // must not decide visibility when the payload has no percentage.
            expect(usageData?.sessionUsage).toBe(percentage ?? 100);
            expect(usageData?.apiSessionUsage).toBeUndefined();
            expect(widget.render(item, { data, usageData }, DEFAULT_SETTINGS)).toBe(percentage === 100 ? 'Reset: 4hr' : null);
        }

        const usageData = await prefetchUsageDataIfNeeded(makeLines([item]));
        expect(widget.render(item, { usageData }, DEFAULT_SETTINGS)).toBeNull();
    });

    it('keeps the cached block percent while its block is still running', async () => {
        vi.useFakeTimers({ now: (1774020000 - 20 * 60) * 1000, toFake: ['Date'] });
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 100, sessionResetAt: epochToIso(1774020000) });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 97, resets_at: 1774020000 } } });

        expect(usageData?.apiSessionUsage).toBe(100);
    });

    it('falls back to rate_limits\' block percent when the under-limit fetch only has a stale cache', async () => {
        // The API is in a backoff, so the fetch serves the last good cache, older
        // and lower than the payload's percent for the same block
        vi.useFakeTimers({ now: (1774020000 - 20 * 60) * 1000, toFake: ['Date'] });
        const staleData: UsageData = { sessionUsage: 97, sessionResetAt: epochToIso(1774020000) };
        mockFetchUsageData.mockResolvedValue(staleData);
        // Marked by identity, so only the object fetchUsageData returned counts as stale
        vi.spyOn(usage, 'isStaleUsageFallback').mockImplementation(data => data === staleData);

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 100, resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionUsage: 100, sessionResetAt: epochToIso(1774020000) });
    });

    it('falls back to rate_limits\' block percent when the under-limit fetch fails', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 100, resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionUsage: 100, sessionResetAt: epochToIso(1774020000) });
    });

    it('fetches the 5-hour block\'s percent for a Block Usage that hides at the limit, even when rate_limits has one', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 100 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage', metadata: { hide: 'at-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 97, resets_at: 1774020000 } } });

        // The widget keeps showing the payload's percent; only the hide state reads the API's
        expect(usageData).toEqual({ sessionUsage: 97, sessionResetAt: epochToIso(1774020000), apiSessionUsage: 100 });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['sessionUsage'] }]
        ]);
    });

    it('fetches the block\'s percent once for Block Usage and Block Reset Timer that swap at the limit', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 100 });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage', metadata: { hide: 'at-limit' } }],
            [{ id: '2', type: 'reset-timer', metadata: { hide: 'under-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 97, resets_at: 1774020000 } } });

        expect(usageData?.apiSessionUsage).toBe(100);
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['sessionUsage'] }]
        ]);
    });

    it('doesn\'t fetch for a Block Usage without the at-limit state when rate_limits has its percent', async () => {
        const lines = makeLines(
            [{ id: '1', type: 'session-usage', metadata: { hide: 'no-data' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 97, resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionUsage: 97, sessionResetAt: epochToIso(1774020000) });
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('falls back to rate_limits\' block percent when the at-limit fetch fails', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'rate-limited' });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage', metadata: { hide: 'at-limit' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 100, resets_at: 1774020000 } } });

        expect(usageData).toEqual({ sessionUsage: 100, sessionResetAt: epochToIso(1774020000) });
    });

    it('keeps statusline usage when cursor metadata requires a missing reset and API has no credentials', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'no-credentials' });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage', metadata: { cursor: 'true' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 42 } } });

        expect(usageData).toEqual({
            sessionUsage: 42,
            error: 'no-credentials'
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('preserves API errors when statusline data is partial and fetch fails', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'no-credentials' });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }, { id: '2', type: 'weekly-sonnet-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 42 } } });

        expect(usageData).toEqual({
            sessionUsage: 42,
            error: 'no-credentials'
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
        expect(mockFetchUsageData.mock.calls[0]).toEqual([{ requiredFields: ['weeklySonnetUsage'] }]);
    });

    it('preserves API errors when statusline data has no usable usage fields', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'no-credentials' });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: {} });

        expect(usageData).toEqual({ error: 'no-credentials' });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('uses aggregate weekly reset as the per-model cursor fallback without fetching for reset data', async () => {
        mockFetchUsageData.mockResolvedValue({ weeklySonnetUsage: 8 });

        const lines = makeLines(
            [{ id: '1', type: 'weekly-sonnet-usage', metadata: { cursor: 'true' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { seven_day: { resets_at: 1774540000 } } });

        expect(usageData).toEqual({
            weeklyResetAt: epochToIso(1774540000),
            weeklySonnetUsage: 8
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
        expect(mockFetchUsageData.mock.calls[0]).toEqual([{ requiredFields: ['weeklySonnetUsage'] }]);
    });

    it('uses aggregate weekly reset as the cursor fallback without fetching for fable reset data', async () => {
        mockFetchUsageData.mockResolvedValue({ fableUsage: 8 });

        const lines = makeLines(
            [{ id: '1', type: 'fable-weekly-usage', metadata: { cursor: 'true' } }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { seven_day: { resets_at: 1774540000 } } });

        expect(usageData).toEqual({
            weeklyResetAt: epochToIso(1774540000),
            fableUsage: 8
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
        expect(mockFetchUsageData.mock.calls[0]).toEqual([{ requiredFields: ['fableUsage'] }]);
    });

    it('fetches extra usage fields while preserving statusline usage data', async () => {
        mockFetchUsageData.mockResolvedValue({
            extraUsageEnabled: true,
            extraUsageLimit: 400000,
            extraUsageUsed: 10600,
            extraUsageUtilization: 2.6
        });

        const lines = makeLines(
            [{ id: '1', type: 'extra-usage-utilization' }, { id: '2', type: 'extra-usage-remaining' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 42 } } });

        expect(usageData).toEqual({
            sessionUsage: 42,
            extraUsageEnabled: true,
            extraUsageLimit: 400000,
            extraUsageUsed: 10600,
            extraUsageUtilization: 2.6
        });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{
                requiredFields: [
                    'extraUsageEnabled',
                    'extraUsageUtilization',
                    'extraUsageLimit',
                    'extraUsageUsed'
                ]
            }]
        ]);
    });

    it('fetches the extra usage state and monthly limit for the Extra Usage Limit widget', async () => {
        mockFetchUsageData.mockResolvedValue({
            extraUsageEnabled: true,
            extraUsageLimit: 50000
        });

        const lines = makeLines([{ id: '1', type: 'extra-usage-limit' }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, {});

        expect(usageData).toEqual({
            extraUsageEnabled: true,
            extraUsageLimit: 50000
        });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['extraUsageEnabled', 'extraUsageLimit'] }]
        ]);
    });

    it('fetches the extra usage state, limit and spend for the Daily Budget widget', async () => {
        mockFetchUsageData.mockResolvedValue({
            extraUsageEnabled: true,
            extraUsageLimit: 50000,
            extraUsageUsed: 12345
        });

        const lines = makeLines([{ id: '1', type: 'extra-usage-daily-budget' }]);

        const usageData = await prefetchUsageDataIfNeeded(lines, {});

        expect(usageData).toEqual({
            extraUsageEnabled: true,
            extraUsageLimit: 50000,
            extraUsageUsed: 12345
        });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['extraUsageEnabled', 'extraUsageLimit', 'extraUsageUsed'] }]
        ]);
    });

    it('preserves API errors when extra usage fields are missing', async () => {
        mockFetchUsageData.mockResolvedValue({ error: 'no-credentials' });

        const lines = makeLines(
            [{ id: '1', type: 'session-usage' }, { id: '2', type: 'extra-usage-remaining' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, { rate_limits: { five_hour: { used_percentage: 42 } } });

        expect(usageData).toEqual({
            sessionUsage: 42,
            error: 'no-credentials'
        });
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{
                requiredFields: [
                    'extraUsageEnabled',
                    'extraUsageLimit',
                    'extraUsageUsed'
                ]
            }]
        ]);
    });

    it('does not require per-model buckets when only the all-models weekly widget is present', async () => {
        const lines = makeLines(
            [{ id: '1', type: 'weekly-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(usageData?.weeklyUsage).toBe(15);
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('fetches scoped API usage when requested per-model stdin buckets are null', async () => {
        mockFetchUsageData.mockResolvedValue({
            weeklySonnetUsage: 8,
            weeklySonnetResetAt: '2026-03-27T12:00:00.000Z',
            weeklyOpusUsage: 2,
            weeklyOpusResetAt: '2026-03-27T12:00:00.000Z'
        });

        const lines = makeLines(
            [{ id: '1', type: 'weekly-sonnet-usage' }, { id: '2', type: 'weekly-opus-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 },
                seven_day_sonnet: null,
                seven_day_opus: null
            }
        });

        expect(usageData?.weeklySonnetUsage).toBe(8);
        expect(usageData?.weeklyOpusUsage).toBe(2);
        expect(mockFetchUsageData.mock.calls).toEqual([[
            { requiredFields: ['weeklySonnetUsage', 'weeklyOpusUsage'] }
        ]]);
    });

    it('does not let null per-model stdin buckets overwrite scoped API usage fetched for another widget', async () => {
        mockFetchUsageData.mockResolvedValue({
            weeklySonnetUsage: 8,
            weeklyOpusUsage: 2,
            extraUsageEnabled: true,
            extraUsageUtilization: 25
        });

        const lines = makeLines(
            [{ id: '1', type: 'extra-usage-utilization' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 },
                seven_day_sonnet: null,
                seven_day_opus: null
            }
        });

        expect(usageData?.weeklySonnetUsage).toBe(8);
        expect(usageData?.weeklyOpusUsage).toBe(2);
        expect(usageData?.extraUsageUtilization).toBe(25);
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('falls back to API fetch when sessionResetAt is missing from rate_limits', async () => {
        mockFetchUsageData.mockResolvedValue({
            sessionUsage: 42,
            sessionResetAt: '2026-03-20T12:00:00.000Z',
            weeklyUsage: 15,
            weeklyResetAt: '2026-03-27T12:00:00.000Z'
        });

        const lines = makeLines(
            [{ id: '1', type: 'reset-timer' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines, {
            rate_limits: {
                five_hour: { used_percentage: 42 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(usageData).toEqual({
            sessionUsage: 42,
            sessionResetAt: '2026-03-20T12:00:00.000Z',
            weeklyUsage: 15,
            weeklyResetAt: epochToIso(1774540000)
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('detects the spend limit widgets as usage widgets', () => {
        expect(hasUsageDependentWidgets(makeLines([{ id: '1', type: 'spend-limit-usage' }]))).toBe(true);
        expect(hasUsageDependentWidgets(makeLines([{ id: '1', type: 'spend-limit-amount' }]))).toBe(true);
    });

    it('serves spend limit widgets from stdin without calling the usage API', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 99 });

        const usageData = await prefetchUsageDataIfNeeded(
            makeLines([{ id: '1', type: 'spend-limit-usage' }, { id: '2', type: 'spend-limit-amount' }]),
            { rate_limits: { spend_limit: { used_percentage: 62.8, used_usd: 314.12, limit_usd: 500 } } }
        );

        expect(usageData).toEqual({
            spendLimitUsage: 62.8,
            spendLimitUsedUsd: 314.12,
            spendLimitLimitUsd: 500
        });
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('does not call the usage API when stdin has no spend limit', async () => {
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 99 });

        const usageData = await prefetchUsageDataIfNeeded(
            makeLines([{ id: '1', type: 'spend-limit-usage' }]),
            { rate_limits: { five_hour: { used_percentage: 42, resets_at: 1774020000 } } }
        );

        expect(usageData?.spendLimitUsage).toBeUndefined();
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });

    it('keeps the spend limit when another widget triggers the API fetch', async () => {
        mockFetchUsageData.mockResolvedValue({ extraUsageEnabled: true, extraUsageUsed: 1000 });

        const usageData = await prefetchUsageDataIfNeeded(
            makeLines([{ id: '1', type: 'spend-limit-usage' }, { id: '2', type: 'extra-usage-used' }]),
            { rate_limits: { spend_limit: { used_percentage: 62.8 } } }
        );

        expect(usageData?.spendLimitUsage).toBe(62.8);
        expect(usageData?.extraUsageUsed).toBe(1000);
        expect(mockFetchUsageData.mock.calls[0]).toEqual([{ requiredFields: ['extraUsageEnabled', 'extraUsageUsed'] }]);
    });
});

describe('today\'s extra usage spend', () => {
    // When the usage API returned the data, as fetchUsageData reports it.
    const FETCHED_AT = Date.parse('2026-10-05T14:58:00Z');
    let mockFetchUsageData: {
        mock: { calls: unknown[][] };
        mockResolvedValue: (value: UsageData) => void;
    };
    let mockObserveSpend: {
        mock: { calls: unknown[][] };
        mockReturnValue: (value: number | undefined) => void;
    };
    let mockLookUpAccount: {
        mock: { calls: unknown[][] };
        mockResolvedValue: (value: usage.UsageAccount | null) => void;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetchUsageData = vi.spyOn(usage, 'fetchUsageData');
        mockFetchUsageData.mockResolvedValue({ extraUsageEnabled: true, extraUsageUsed: 12345 });
        mockObserveSpend = vi.spyOn(dailySpend, 'observeExtraUsageSpend');
        mockObserveSpend.mockReturnValue(825);
        // Until a test names the account, the profile lookup has no answer
        // and today's spend stays under the login's token fingerprint.
        mockLookUpAccount = vi.spyOn(usage, 'lookUpUsageAccount');
        mockLookUpAccount.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('works out today\'s spend for the Extra Usage Today widget', async () => {
        vi.spyOn(usage, 'getUsageAccountKey').mockReturnValue('work-login');
        vi.spyOn(usage, 'getUsageFetchedAtMs').mockReturnValue(FETCHED_AT);

        const usageData = await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-today' }]), {});

        expect(usageData).toEqual({
            extraUsageEnabled: true,
            extraUsageUsed: 12345,
            extraUsageUsedToday: 825
        });
        expect(mockObserveSpend.mock.calls).toEqual([['work-login', 12345, FETCHED_AT]]);
        expect(mockFetchUsageData.mock.calls).toEqual([
            [{ requiredFields: ['extraUsageEnabled', 'extraUsageUsed'] }]
        ]);
    });

    it('leaves today\'s spend out when the login is unknown', async () => {
        vi.spyOn(usage, 'getUsageAccountKey').mockReturnValue(null);
        vi.spyOn(usage, 'getUsageFetchedAtMs').mockReturnValue(FETCHED_AT);

        const usageData = await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-today' }]), {});

        expect(usageData).toEqual({ extraUsageEnabled: true, extraUsageUsed: 12345 });
        expect(mockObserveSpend.mock.calls).toEqual([]);
    });

    it('leaves today\'s spend out when the fetch returned no data time', async () => {
        vi.spyOn(usage, 'getUsageAccountKey').mockReturnValue('work-login');
        vi.spyOn(usage, 'getUsageFetchedAtMs').mockReturnValue(undefined);

        const usageData = await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-today' }]), {});

        expect(usageData).toEqual({ extraUsageEnabled: true, extraUsageUsed: 12345 });
        expect(mockObserveSpend.mock.calls).toEqual([]);
    });

    it('only works out today\'s spend when a widget shows it', async () => {
        vi.spyOn(usage, 'getUsageAccountKey').mockReturnValue('work-login');

        await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-used' }]), {});

        expect(mockObserveSpend.mock.calls).toEqual([]);
    });

    // The token fingerprint changes each time Claude Code refreshes its
    // tokens; the account the profile lookup names doesn't. Records kept
    // under the account's fingerprints move over to it.
    it('keeps today\'s spend under the account the profile lookup names', async () => {
        vi.spyOn(usage, 'getUsageAccountKey').mockReturnValue('work-login');
        vi.spyOn(usage, 'getUsageFetchedAtMs').mockReturnValue(FETCHED_AT);
        mockLookUpAccount.mockResolvedValue({ key: 'account:work', fingerprints: ['work-login', 'earlier-work-login'] });

        const usageData = await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-today' }]), {});

        expect(usageData).toEqual({
            extraUsageEnabled: true,
            extraUsageUsed: 12345,
            extraUsageUsedToday: 825
        });
        expect(mockObserveSpend.mock.calls).toEqual([
            ['account:work', 12345, FETCHED_AT, undefined, ['work-login', 'earlier-work-login']]
        ]);
    });

    it('only looks up the account when it records today\'s spend', async () => {
        vi.spyOn(usage, 'getUsageFetchedAtMs').mockReturnValue(FETCHED_AT);
        const accountKey = vi.spyOn(usage, 'getUsageAccountKey').mockReturnValue('work-login');

        await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-used' }]), {});
        accountKey.mockReturnValue(null);
        await prefetchUsageDataIfNeeded(makeLines([{ id: '1', type: 'extra-usage-today' }]), {});

        expect(mockLookUpAccount.mock.calls).toEqual([]);
    });
});

describe('extractUsageDataFromRateLimits', () => {
    it('extracts spend_limit percentage and dollar amounts', () => {
        const result = extractUsageDataFromRateLimits({
            spend_limit: {
                used_percentage: 62.8,
                resets_at: 1740787200,
                used_usd: 314.12,
                limit_usd: 500,
                period: 'monthly'
            }
        });

        expect(result).toEqual({
            spendLimitUsage: 62.8,
            spendLimitUsedUsd: 314.12,
            spendLimitLimitUsd: 500
        });
    });

    it('extracts spend_limit when the dollar fields are absent', () => {
        const result = extractUsageDataFromRateLimits({ spend_limit: { used_percentage: 0, resets_at: 1740787200 } });

        expect(result).toEqual({ spendLimitUsage: 0 });
    });

    it('leaves spend limit fields undefined when spend_limit is absent or null', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: 42 }, spend_limit: null });

        expect(result?.spendLimitUsage).toBeUndefined();
    });

    it('extracts session and weekly usage from rate_limits', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 42, resets_at: 1774020000 },
            seven_day: { used_percentage: 15, resets_at: 1774540000 }
        });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBe(42);
        expect(result?.weeklyUsage).toBe(15);
    });

    it('converts epoch seconds to ISO strings for resets_at', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 42, resets_at: 1774020000 },
            seven_day: { used_percentage: 15, resets_at: 1774540000 }
        });

        expect(result?.sessionResetAt).toBe(new Date(1774020000 * 1000).toISOString());
        expect(result?.weeklyResetAt).toBe(new Date(1774540000 * 1000).toISOString());
    });

    it('returns null when rate_limits is null', () => {
        expect(extractUsageDataFromRateLimits(null)).toBeNull();
    });

    it('returns null when rate_limits is undefined', () => {
        expect(extractUsageDataFromRateLimits(undefined)).toBeNull();
    });

    it('extracts reset-only data when percentages are missing', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { resets_at: 1774020000 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBeUndefined();
        expect(result?.sessionResetAt).toBe(epochToIso(1774020000));
        expect(result?.weeklyUsage).toBeUndefined();
    });

    it('extracts partial data when only five_hour is present', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: 50, resets_at: 1774020000 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBe(50);
        expect(result?.weeklyUsage).toBeUndefined();
    });

    it('extracts partial data when only seven_day is present', () => {
        const result = extractUsageDataFromRateLimits({ seven_day: { used_percentage: 10, resets_at: 1774540000 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBeUndefined();
        expect(result?.weeklyUsage).toBe(10);
    });

    it('treats used_percentage of 0 as valid data', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: 0, resets_at: 1774020000 } });

        expect(result).not.toBeNull();
        expect(result?.sessionUsage).toBe(0);
    });

    it('treats null used_percentage as missing while keeping reset data', () => {
        const result = extractUsageDataFromRateLimits({ five_hour: { used_percentage: null, resets_at: 1774020000 } });

        expect(result?.sessionUsage).toBeUndefined();
        expect(result?.sessionResetAt).toBe(epochToIso(1774020000));
    });

    it('extracts per-model weekly buckets when present', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 42, resets_at: 1774020000 },
            seven_day: { used_percentage: 15, resets_at: 1774540000 },
            seven_day_sonnet: { used_percentage: 8, resets_at: 1774540001 },
            seven_day_opus: { used_percentage: 2, resets_at: 1774540002 }
        });

        expect(result?.weeklySonnetUsage).toBe(8);
        expect(result?.weeklyOpusUsage).toBe(2);
        expect(result?.weeklySonnetResetAt).toBe(new Date(1774540001 * 1000).toISOString());
        expect(result?.weeklyOpusResetAt).toBe(new Date(1774540002 * 1000).toISOString());
    });

    it('leaves per-model fields undefined when buckets are absent', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 42, resets_at: 1774020000 },
            seven_day: { used_percentage: 15, resets_at: 1774540000 }
        });

        expect(result?.weeklySonnetUsage).toBeUndefined();
        expect(result?.weeklyOpusUsage).toBeUndefined();
    });

    it('treats null per-model buckets as missing until the API is checked', () => {
        const result = extractUsageDataFromRateLimits({
            five_hour: { used_percentage: 42, resets_at: 1774020000 },
            seven_day: { used_percentage: 15, resets_at: 1774540000 },
            seven_day_sonnet: null,
            seven_day_opus: null
        });

        expect(result?.weeklySonnetUsage).toBeUndefined();
        expect(result?.weeklyOpusUsage).toBeUndefined();
    });
});
