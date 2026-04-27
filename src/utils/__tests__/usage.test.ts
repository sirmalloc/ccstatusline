import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { BlockMetrics } from '../../types';
import * as jsonl from '../jsonl';
import {
    FIVE_HOUR_BLOCK_MS,
    SEVEN_DAY_WINDOW_MS
} from '../usage-types';
import {
    formatUsageDuration,
    formatUsageResetAt,
    getUsageWindowFromResetAt,
    getWeeklyUsageWindowFromResetAt,
    resolveUsageWindowWithFallback,
    resolveWeeklyUsageWindow
} from '../usage-windows';

describe('usage window helpers', () => {
    let mockGetCachedBlockMetrics: {
        mock: { calls: unknown[][] };
        mockReturnValue: (value: BlockMetrics | null) => void;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetCachedBlockMetrics = vi.spyOn(jsonl, 'getCachedBlockMetrics');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('parses usage reset timestamp into elapsed and remaining metrics', () => {
        const nowMs = Date.parse('2026-03-02T20:00:00.000Z');
        const resetAt = '2026-03-02T22:00:00.000Z';

        const window = getUsageWindowFromResetAt(resetAt, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3 * 60 * 60 * 1000);
        expect(window?.remainingMs).toBe(2 * 60 * 60 * 1000);
        expect(window?.elapsedPercent).toBeCloseTo(60, 5);
        expect(window?.remainingPercent).toBeCloseTo(40, 5);
        expect(window?.sessionDurationMs).toBe(FIVE_HOUR_BLOCK_MS);
    });

    it('uses usage data first and does not parse JSONL when reset timestamp exists', () => {
        const nowMs = Date.parse('2026-03-02T20:00:00.000Z');
        const fallbackMetrics: BlockMetrics = {
            startTime: new Date('2026-03-02T15:00:00.000Z'),
            lastActivity: new Date('2026-03-02T20:00:00.000Z')
        };

        mockGetCachedBlockMetrics.mockReturnValue(fallbackMetrics);

        const window = resolveUsageWindowWithFallback({ sessionResetAt: '2026-03-02T22:00:00.000Z' }, undefined, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(0);
    });

    it('uses provided block metrics fallback without parsing JSONL', () => {
        const nowMs = Date.parse('2026-03-02T18:30:00.000Z');
        const providedMetrics: BlockMetrics = {
            startTime: new Date('2026-03-02T15:00:00.000Z'),
            lastActivity: new Date('2026-03-02T18:30:00.000Z')
        };

        const window = resolveUsageWindowWithFallback({}, providedMetrics, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3.5 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(0);
    });

    it('parses JSONL fallback only when usage reset data is missing', () => {
        const nowMs = Date.parse('2026-03-02T18:00:00.000Z');
        const fallbackMetrics: BlockMetrics = {
            startTime: new Date('2026-03-02T15:00:00.000Z'),
            lastActivity: new Date('2026-03-02T18:00:00.000Z')
        };

        mockGetCachedBlockMetrics.mockReturnValue(fallbackMetrics);

        const window = resolveUsageWindowWithFallback({}, undefined, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(1);
    });

    it('returns null when neither usage reset data nor JSONL fallback is available', () => {
        mockGetCachedBlockMetrics.mockReturnValue(null);

        const window = resolveUsageWindowWithFallback({}, undefined, Date.now());

        expect(window).toBeNull();
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(1);
    });

    it('parses weekly reset timestamp into elapsed and remaining metrics', () => {
        const nowMs = Date.parse('2026-03-04T20:00:00.000Z');
        const resetAt = '2026-03-09T20:00:00.000Z';

        const window = getWeeklyUsageWindowFromResetAt(resetAt, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(2 * 24 * 60 * 60 * 1000);
        expect(window?.remainingMs).toBe(5 * 24 * 60 * 60 * 1000);
        expect(window?.elapsedPercent).toBeCloseTo((2 / 7) * 100, 5);
        expect(window?.remainingPercent).toBeCloseTo((5 / 7) * 100, 5);
        expect(window?.sessionDurationMs).toBe(SEVEN_DAY_WINDOW_MS);
    });

    it('returns null for missing or invalid weekly reset timestamps', () => {
        expect(getWeeklyUsageWindowFromResetAt(undefined, Date.now())).toBeNull();
        expect(getWeeklyUsageWindowFromResetAt('not-a-date', Date.now())).toBeNull();
    });

    it('resolves weekly window directly from usage data without JSONL fallback', () => {
        const nowMs = Date.parse('2026-03-04T20:00:00.000Z');
        const window = resolveWeeklyUsageWindow({ weeklyResetAt: '2026-03-09T20:00:00.000Z' }, nowMs);

        expect(window).not.toBeNull();
        expect(window?.remainingMs).toBe(5 * 24 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(0);
    });

    it('formats duration in block timer style', () => {
        expect(formatUsageDuration(0)).toBe('0m');
        expect(formatUsageDuration(3 * 60 * 60 * 1000)).toBe('3hr');
        expect(formatUsageDuration(3.5 * 60 * 60 * 1000)).toBe('3hr 30m');
        expect(formatUsageDuration(4 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('4hr 5m');
    });

    it('formats duration with days when >= 24h', () => {
        expect(formatUsageDuration(25 * 60 * 60 * 1000)).toBe('1d 1hr');
        expect(formatUsageDuration(36.5 * 60 * 60 * 1000)).toBe('1d 12hr 30m');
        expect(formatUsageDuration(168 * 60 * 60 * 1000)).toBe('7d');
    });

    it('formats duration in compact style', () => {
        expect(formatUsageDuration(0, true)).toBe('0m');
        expect(formatUsageDuration(3 * 60 * 60 * 1000, true)).toBe('3h');
        expect(formatUsageDuration(3.5 * 60 * 60 * 1000, true)).toBe('3h30m');
        expect(formatUsageDuration(4 * 60 * 60 * 1000 + 5 * 60 * 1000, true)).toBe('4h5m');
    });

    it('formats reset timestamps in UTC date mode', () => {
        expect(formatUsageResetAt('2026-03-12T08:30:00.000Z')).toBe('2026-03-12 08:30 UTC');
        expect(formatUsageResetAt('2026-03-12T08:30:00.000Z', true)).toBe('03-12 08:30Z');
    });

    it('returns null for invalid reset timestamps in date mode', () => {
        expect(formatUsageResetAt(undefined)).toBeNull();
        expect(formatUsageResetAt('not-a-date')).toBeNull();
    });

    it('formats reset timestamps in a specific IANA timezone', () => {
        const result = formatUsageResetAt('2026-04-27T10:00:00.000Z', false, 'Asia/Tokyo');
        expect(result).toMatch(/^2026-04-27 19:00 /);
        const compactResult = formatUsageResetAt('2026-04-27T10:00:00.000Z', true, 'Asia/Tokyo');
        expect(compactResult).toBe('04-27 19:00');
    });

    it('keeps UTC behavior when timezone is undefined or "UTC"', () => {
        expect(formatUsageResetAt('2026-03-12T08:30:00.000Z')).toBe('2026-03-12 08:30 UTC');
        expect(formatUsageResetAt('2026-03-12T08:30:00.000Z', false, 'UTC')).toBe('2026-03-12 08:30 UTC');
        expect(formatUsageResetAt('2026-03-12T08:30:00.000Z', true, 'UTC')).toBe('03-12 08:30Z');
    });

    it('falls back to UTC when timezone is invalid', () => {
        const result = formatUsageResetAt('2026-03-12T08:30:00.000Z', false, 'Not/A_Real_Zone');
        expect(result).toBe('2026-03-12 08:30 UTC');
    });

    it('renders the system local timezone when timezone is "local"', () => {
        const result = formatUsageResetAt('2026-03-12T08:30:00.000Z', false, 'local');
        expect(result).not.toBeNull();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \S+$/);
    });

    it('formats duration with days in compact style when >= 24h', () => {
        expect(formatUsageDuration(25 * 60 * 60 * 1000, true)).toBe('1d1h');
        expect(formatUsageDuration(36.5 * 60 * 60 * 1000, true)).toBe('1d12h30m');
        expect(formatUsageDuration(168 * 60 * 60 * 1000, true)).toBe('7d');
    });

    it('formats duration without days when requested', () => {
        expect(formatUsageDuration(25 * 60 * 60 * 1000, false, false)).toBe('25hr');
        expect(formatUsageDuration(36.5 * 60 * 60 * 1000, false, false)).toBe('36hr 30m');
        expect(formatUsageDuration(168 * 60 * 60 * 1000, false, false)).toBe('168hr');
    });

    it('formats duration without days in compact style when requested', () => {
        expect(formatUsageDuration(25 * 60 * 60 * 1000, true, false)).toBe('25h');
        expect(formatUsageDuration(36.5 * 60 * 60 * 1000, true, false)).toBe('36h30m');
        expect(formatUsageDuration(168 * 60 * 60 * 1000, true, false)).toBe('168h');
    });
});
