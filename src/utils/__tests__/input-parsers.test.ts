import {
    describe,
    expect,
    it
} from 'vitest';

import {
    extractTokenMetricsFromContextWindow,
    formatDurationMs
} from '../input-parsers';

describe('extractTokenMetricsFromContextWindow', () => {
    it('should return null for undefined input', () => {
        const result = extractTokenMetricsFromContextWindow(undefined, undefined);
        expect(result).toBeNull();
    });

    it('should extract token metrics from complete context_window', () => {
        const contextWindow = {
            total_input_tokens: 15234,
            total_output_tokens: 4521,
            context_window_size: 200000,
            used_percentage: 12.5,
            remaining_percentage: 87.5,
            current_usage: {
                input_tokens: 8500,
                output_tokens: 1200,
                cache_creation_input_tokens: 5000,
                cache_read_input_tokens: 2000
            }
        };

        const result = extractTokenMetricsFromContextWindow(contextWindow, undefined);

        expect(result).not.toBeNull();
        expect(result?.inputTokens).toBe(15234);
        expect(result?.outputTokens).toBe(4521);
        expect(result?.cachedTokens).toBe(7000); // 5000 + 2000
        expect(result?.totalTokens).toBe(26755); // 15234 + 4521 + 7000
        expect(result?.contextLength).toBe(15500); // 8500 + 5000 + 2000
        expect(result?.usedPercentage).toBe(12.5);
        expect(result?.remainingPercentage).toBe(87.5);
    });

    it('should handle missing optional fields with defaults', () => {
        const contextWindow = {};

        const result = extractTokenMetricsFromContextWindow(contextWindow, undefined);

        expect(result).not.toBeNull();
        expect(result?.inputTokens).toBe(0);
        expect(result?.outputTokens).toBe(0);
        expect(result?.cachedTokens).toBe(0);
        expect(result?.totalTokens).toBe(0);
        expect(result?.contextLength).toBe(0);
        expect(result?.usedPercentage).toBe(0);
        expect(result?.remainingPercentage).toBe(100);
    });

    it('should handle partial current_usage', () => {
        const contextWindow = {
            total_input_tokens: 1000,
            total_output_tokens: 500,
            current_usage: {
                input_tokens: 800,
                cache_read_input_tokens: 200
            }
        };

        const result = extractTokenMetricsFromContextWindow(contextWindow, undefined);

        expect(result).not.toBeNull();
        expect(result?.inputTokens).toBe(1000);
        expect(result?.outputTokens).toBe(500);
        expect(result?.cachedTokens).toBe(200); // only cache_read, no cache_creation
        expect(result?.totalTokens).toBe(1700); // 1000 + 500 + 200
        expect(result?.contextLength).toBe(1000); // 800 + 0 + 200
    });

    it('should handle missing current_usage', () => {
        const contextWindow = {
            total_input_tokens: 5000,
            total_output_tokens: 2000
        };

        const result = extractTokenMetricsFromContextWindow(contextWindow, undefined);

        expect(result).not.toBeNull();
        expect(result?.inputTokens).toBe(5000);
        expect(result?.outputTokens).toBe(2000);
        expect(result?.cachedTokens).toBe(0);
        expect(result?.totalTokens).toBe(7000);
        expect(result?.contextLength).toBe(0);
    });

    it('should use getContextConfig fallback when context_window_size is missing', () => {
        const contextWindow = {
            total_input_tokens: 1000,
            total_output_tokens: 500,
            current_usage: { input_tokens: 1000 }
        };

        // With 1M model, should use 1000000 as context window size
        const result1M = extractTokenMetricsFromContextWindow(
            contextWindow,
            'claude-sonnet-4-5-20250929[1m]'
        );
        expect(result1M?.contextWindowSize).toBe(1000000);

        // With regular model, should use 200000 as context window size
        const resultDefault = extractTokenMetricsFromContextWindow(
            contextWindow,
            'claude-sonnet-4-5-20250929'
        );
        expect(resultDefault?.contextWindowSize).toBe(200000);
    });

    it('should calculate percentages when not provided', () => {
        const contextWindow = {
            total_input_tokens: 1000,
            total_output_tokens: 500,
            context_window_size: 10000,
            current_usage: {
                input_tokens: 2000,
                cache_creation_input_tokens: 500,
                cache_read_input_tokens: 500
            }
        };

        const result = extractTokenMetricsFromContextWindow(contextWindow, undefined);

        // contextLength = 2000 + 500 + 500 = 3000
        // usedPercentage = 3000 / 10000 * 100 = 30%
        expect(result?.contextLength).toBe(3000);
        expect(result?.usedPercentage).toBe(30);
        expect(result?.remainingPercentage).toBe(70);
    });

    it('should cap usedPercentage at 100 and remainingPercentage at 0', () => {
        const contextWindow = {
            context_window_size: 1000,
            // More than context window
            current_usage: { input_tokens: 2000 }
        };

        const result = extractTokenMetricsFromContextWindow(contextWindow, undefined);

        // contextLength = 2000, which exceeds context_window_size of 1000
        // usedPercentage should be capped at 100
        expect(result?.usedPercentage).toBe(100);
        expect(result?.remainingPercentage).toBe(0);
    });
});

describe('formatDurationMs', () => {
    it('should return "<1m" for durations less than 1 minute', () => {
        expect(formatDurationMs(0)).toBe('<1m');
        expect(formatDurationMs(30000)).toBe('<1m'); // 30 seconds
        expect(formatDurationMs(59999)).toBe('<1m'); // Just under 1 minute
    });

    it('should return minutes only for durations under 1 hour', () => {
        expect(formatDurationMs(60000)).toBe('1m'); // Exactly 1 minute
        expect(formatDurationMs(300000)).toBe('5m'); // 5 minutes
        expect(formatDurationMs(3540000)).toBe('59m'); // 59 minutes
    });

    it('should return hours only when no remaining minutes', () => {
        expect(formatDurationMs(3600000)).toBe('1hr'); // Exactly 1 hour
        expect(formatDurationMs(7200000)).toBe('2hr'); // 2 hours
        expect(formatDurationMs(36000000)).toBe('10hr'); // 10 hours
    });

    it('should return hours and minutes when both are present', () => {
        expect(formatDurationMs(3660000)).toBe('1hr 1m'); // 1 hour 1 minute
        expect(formatDurationMs(3720000)).toBe('1hr 2m'); // 1 hour 2 minutes
        expect(formatDurationMs(5400000)).toBe('1hr 30m'); // 1 hour 30 minutes
        expect(formatDurationMs(9000000)).toBe('2hr 30m'); // 2 hours 30 minutes
    });
});