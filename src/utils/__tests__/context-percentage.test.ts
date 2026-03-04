import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { calculateContextPercentage } from '../context-percentage';

describe('calculateContextPercentage', () => {
    describe('Status JSON context_window', () => {
        it('should prefer context_window used_percentage over token metrics', () => {
            const context: RenderContext = {
                data: {
                    model: { id: 'claude-3-5-sonnet-20241022' },
                    context_window: {
                        context_window_size: 200000,
                        used_percentage: 12.5
                    }
                },
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 100000
                }
            };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(12.5);
        });

        it('should derive percentage from current usage and window size when used_percentage is missing', () => {
            const context: RenderContext = {
                data: {
                    context_window: {
                        context_window_size: 200000,
                        current_usage: {
                            input_tokens: 20000,
                            output_tokens: 10000,
                            cache_creation_input_tokens: 5000,
                            cache_read_input_tokens: 5000
                        }
                    }
                }
            };

            const percentage = calculateContextPercentage(context);
            expect(percentage).toBe(20);
        });

        it('should use context_window_size as denominator when falling back to token metrics', () => {
            const context: RenderContext = {
                data: {
                    model: { id: 'claude-3-5-sonnet-20241022' },
                    context_window: { context_window_size: 1000000 }
                },
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
    });

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

        it('should calculate percentage using 1M denominator with 1M context label', () => {
            const context: RenderContext = {
                data: { model: { id: 'Opus 4.6 (1M context)' } },
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

        it('should calculate percentage using 1M denominator with 1M in parentheses', () => {
            const context: RenderContext = {
                data: { model: { id: 'Opus 4.6 (1M)' } },
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

        it('should calculate percentage from display_name when model id lacks context size suffix', () => {
            const context: RenderContext = {
                data: {
                    model: {
                        id: 'claude-opus-4-6',
                        display_name: 'Opus 4.6 (1M context)'
                    }
                },
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