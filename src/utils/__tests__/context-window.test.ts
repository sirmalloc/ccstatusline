import {
    describe,
    expect,
    it
} from 'vitest';

import { getContextWindowMetrics } from '../context-window';

describe('getContextWindowMetrics', () => {
    it('returns null metrics when context_window is missing', () => {
        expect(getContextWindowMetrics(undefined)).toEqual({
            windowSize: null,
            usedTokens: null,
            contextLengthTokens: null,
            usedPercentage: null,
            remainingPercentage: null,
            totalInputTokens: null,
            totalOutputTokens: null,
            cachedTokens: null,
            totalTokens: null
        });
    });

    it('extracts totals and usage from current_usage object', () => {
        const metrics = getContextWindowMetrics({
            context_window: {
                context_window_size: 200000,
                total_input_tokens: 4567,
                total_output_tokens: 890,
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 200,
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 400
                }
            }
        });

        expect(metrics).toEqual({
            windowSize: 200000,
            usedTokens: 1900,
            contextLengthTokens: 1700,
            usedPercentage: 0.95,
            remainingPercentage: 99.05,
            totalInputTokens: 4567,
            totalOutputTokens: 890,
            cachedTokens: 700,
            totalTokens: 1900
        });
    });

    it('derives token usage from used_percentage when current_usage is missing', () => {
        const metrics = getContextWindowMetrics({
            context_window: {
                context_window_size: 200000,
                used_percentage: 12.5,
                remaining_percentage: 87.5,
                total_input_tokens: 5000,
                total_output_tokens: 1000
            }
        });

        expect(metrics).toEqual({
            windowSize: 200000,
            usedTokens: 25000,
            contextLengthTokens: 25000,
            usedPercentage: 12.5,
            remainingPercentage: 87.5,
            totalInputTokens: 5000,
            totalOutputTokens: 1000,
            cachedTokens: null,
            totalTokens: 6000
        });
    });

    describe('all-zero transient frame filtering', () => {
        it('returns null usage for all-zero frame with current_usage object', () => {
            const metrics = getContextWindowMetrics({
                context_window: {
                    context_window_size: 200000,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    current_usage: {
                        input_tokens: 0,
                        output_tokens: 0,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    },
                    used_percentage: 0,
                    remaining_percentage: 100
                }
            });

            expect(metrics.windowSize).toBe(200000);
            expect(metrics.usedTokens).toBeNull();
            expect(metrics.contextLengthTokens).toBeNull();
            expect(metrics.usedPercentage).toBeNull();
            expect(metrics.remainingPercentage).toBeNull();
            expect(metrics.cachedTokens).toBeNull();
            expect(metrics.totalTokens).toBeNull();
        });

        it('returns null usage for all-zero frame with scalar current_usage=0', () => {
            const metrics = getContextWindowMetrics({
                context_window: {
                    context_window_size: 200000,
                    current_usage: 0,
                    used_percentage: 0
                }
            });

            expect(metrics.usedTokens).toBeNull();
            expect(metrics.contextLengthTokens).toBeNull();
            expect(metrics.usedPercentage).toBeNull();
        });

        it('preserves non-zero usage even when used_percentage is 0', () => {
            const metrics = getContextWindowMetrics({
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 100,
                        output_tokens: 0,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    },
                    used_percentage: 0
                }
            });

            expect(metrics.usedTokens).toBe(100);
            expect(metrics.usedPercentage).toBe(0);
        });
    });
});
