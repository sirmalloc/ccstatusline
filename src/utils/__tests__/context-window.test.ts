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

    it('extracts totals and usage from current_usage object, leaving output tokens out of the percentage', () => {
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
            // contextLengthTokens over the window: output tokens aren't counted
            usedPercentage: (1700 / 200000) * 100,
            remainingPercentage: 100 - (1700 / 200000) * 100,
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

    it('treats an all-zero reading as unreported context, keeping the token totals', () => {
        const metrics = getContextWindowMetrics({
            context_window: {
                context_window_size: 1000000,
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

        expect(metrics).toEqual({
            windowSize: 1000000,
            usedTokens: null,
            contextLengthTokens: null,
            usedPercentage: null,
            remainingPercentage: null,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0
        });
    });

    it('treats a zero numeric current_usage as unreported context', () => {
        const metrics = getContextWindowMetrics({
            context_window: {
                context_window_size: 200000,
                current_usage: 0
            }
        });

        expect(metrics).toEqual({
            windowSize: 200000,
            usedTokens: null,
            contextLengthTokens: null,
            usedPercentage: null,
            remainingPercentage: null,
            totalInputTokens: null,
            totalOutputTokens: null,
            cachedTokens: null,
            totalTokens: 0
        });
    });

    it('uses the token count over a used_percentage rounded down to 0', () => {
        const metrics = getContextWindowMetrics({
            context_window: {
                context_window_size: 1000000,
                current_usage: {
                    input_tokens: 4000,
                    output_tokens: 100,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 0
                },
                used_percentage: 0,
                remaining_percentage: 100
            }
        });

        expect(metrics).toEqual({
            windowSize: 1000000,
            usedTokens: 4100,
            contextLengthTokens: 4000,
            usedPercentage: 0.4,
            remainingPercentage: 99.6,
            totalInputTokens: null,
            totalOutputTokens: null,
            cachedTokens: 0,
            totalTokens: 4100
        });
    });

    it('does not count output tokens as context when the input side is zero', () => {
        const metrics = getContextWindowMetrics({
            context_window: {
                context_window_size: 1000000,
                current_usage: {
                    input_tokens: 0,
                    output_tokens: 500,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 0
                }
            }
        });

        expect(metrics).toEqual({
            windowSize: 1000000,
            usedTokens: 500,
            contextLengthTokens: null,
            usedPercentage: null,
            remainingPercentage: null,
            totalInputTokens: null,
            totalOutputTokens: null,
            cachedTokens: 0,
            totalTokens: 500
        });
    });
});
