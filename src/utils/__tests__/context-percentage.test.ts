import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { calculateContextPercentage } from '../context-percentage';

describe('calculateContextPercentage', () => {
    describe('Sonnet 4.5 with 1M context window', () => {
        it('should calculate percentage using 1M denominator with [1m] suffix', () => {
            const context: RenderContext = {
                data: { model: { id: 'claude-sonnet-4-5-20250929[1m]' } },
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 42000
                }
            };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(4.2);
        });

        it('should cap at 100% with [1m] suffix', () => {
            const context: RenderContext = {
                data: { model: { id: 'claude-sonnet-4-5-20250929[1m]' } },
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 2000000
                }
            };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(100);
        });
    });

    describe('Older models with 200k context window', () => {
        it('should calculate percentage using 200k denominator', () => {
            const context: RenderContext = {
                data: { model: { id: 'claude-3-5-sonnet-20241022' } },
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 42000
                }
            };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(21.0);
        });

        it('should return 0 when no token metrics', () => {
            const context: RenderContext = { data: { model: { id: 'claude-3-5-sonnet-20241022' } } };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(0);
        });

        it('should use default 200k context when model ID is undefined', () => {
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 42000
                }
            };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(21.0);
        });
    });
});