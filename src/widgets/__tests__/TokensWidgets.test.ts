import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import * as renderer from '../../utils/renderer';

async function loadWidgets() {
    const [{ TokensInputWidget }, { TokensOutputWidget }, { TokensCachedWidget }, { TokensTotalWidget }] = await Promise.all([
        import('../TokensInput'),
        import('../TokensOutput'),
        import('../TokensCached'),
        import('../TokensTotal')
    ]);

    return {
        TokensCachedWidget,
        TokensInputWidget,
        TokensOutputWidget,
        TokensTotalWidget
    };
}

describe('Token widgets', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(renderer, 'formatTokens').mockImplementation((value: number) => `fmt:${value}`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('use context_window values for input/output and tokenMetrics totals for cached/total', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    total_input_tokens: 1111,
                    total_output_tokens: 2222,
                    current_usage: {
                        input_tokens: 300,
                        output_tokens: 400,
                        cache_creation_input_tokens: 50,
                        cache_read_input_tokens: 25
                    }
                }
            },
            tokenMetrics: {
                inputTokens: 9999,
                outputTokens: 9999,
                cachedTokens: 9999,
                totalTokens: 9999,
                contextLength: 9999
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:1111');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:2222');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: fmt:9999');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: fmt:9999');
    });

    it('fall back to token metrics when context_window data is missing', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 1200,
                outputTokens: 3400,
                cachedTokens: 560,
                totalTokens: 5160,
                contextLength: 0
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:1200');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:3400');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: fmt:560');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: fmt:5160');
    });

    it('renders raw values without labels for all token widgets', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    total_input_tokens: 1111,
                    total_output_tokens: 2222,
                    current_usage: {
                        input_tokens: 300,
                        output_tokens: 400,
                        cache_creation_input_tokens: 50,
                        cache_read_input_tokens: 25
                    }
                }
            },
            tokenMetrics: {
                inputTokens: 1200,
                outputTokens: 3400,
                cachedTokens: 560,
                totalTokens: 5160,
                contextLength: 20000
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:1111');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:2222');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:560');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:5160');
    });

    it('renders expected preview labels and raw values for all token widgets', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = { isPreview: true };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: 15.2k');
        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('15.2k');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: 3.4k');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('3.4k');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: 12k');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('12k');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: 30.6k');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('30.6k');
    });

    describe('getValue', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('TokensInputWidget returns numeric value from context_window data', async () => {
            const { TokensInputWidget } = await loadWidgets();
            const widget = new TokensInputWidget();
            const context: RenderContext = {
                data: {
                    context_window: {
                        total_input_tokens: 1100,
                        total_output_tokens: 2200,
                        current_usage: {
                            input_tokens: 300,
                            output_tokens: 400,
                            cache_creation_input_tokens: 50,
                            cache_read_input_tokens: 25
                        }
                    }
                }
            };
            const item = { id: 'in', type: 'tokens-input' as const };

            expect(widget.getValueType()).toBe('number');
            expect(widget.getValue(context, item)).toBe(1100);
        });

        it('TokensInputWidget returns numeric value from tokenMetrics fallback', async () => {
            const { TokensInputWidget } = await loadWidgets();
            const widget = new TokensInputWidget();
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 1200,
                    outputTokens: 3400,
                    cachedTokens: 560,
                    totalTokens: 5160,
                    contextLength: 0
                }
            };
            const item = { id: 'in', type: 'tokens-input' as const };

            expect(widget.getValue(context, item)).toBe(1200);
        });

        it('TokensInputWidget returns numeric value in preview mode', async () => {
            const { TokensInputWidget } = await loadWidgets();
            const widget = new TokensInputWidget();
            const context: RenderContext = { isPreview: true };
            const item = { id: 'in', type: 'tokens-input' as const };

            expect(widget.getValue(context, item)).toBe(15200);
        });

        it('TokensInputWidget returns null when data is missing', async () => {
            const { TokensInputWidget } = await loadWidgets();
            const widget = new TokensInputWidget();
            const context: RenderContext = {};
            const item = { id: 'in', type: 'tokens-input' as const };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('TokensOutputWidget returns numeric value from context_window data', async () => {
            const { TokensOutputWidget } = await loadWidgets();
            const widget = new TokensOutputWidget();
            const context: RenderContext = {
                data: {
                    context_window: {
                        total_input_tokens: 1100,
                        total_output_tokens: 2200,
                        current_usage: {
                            input_tokens: 300,
                            output_tokens: 400,
                            cache_creation_input_tokens: 50,
                            cache_read_input_tokens: 25
                        }
                    }
                }
            };
            const item = { id: 'out', type: 'tokens-output' as const };

            expect(widget.getValueType()).toBe('number');
            expect(widget.getValue(context, item)).toBe(2200);
        });

        it('TokensOutputWidget returns numeric value from tokenMetrics fallback', async () => {
            const { TokensOutputWidget } = await loadWidgets();
            const widget = new TokensOutputWidget();
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 1200,
                    outputTokens: 3400,
                    cachedTokens: 560,
                    totalTokens: 5160,
                    contextLength: 0
                }
            };
            const item = { id: 'out', type: 'tokens-output' as const };

            expect(widget.getValue(context, item)).toBe(3400);
        });

        it('TokensOutputWidget returns numeric value in preview mode', async () => {
            const { TokensOutputWidget } = await loadWidgets();
            const widget = new TokensOutputWidget();
            const context: RenderContext = { isPreview: true };
            const item = { id: 'out', type: 'tokens-output' as const };

            expect(widget.getValue(context, item)).toBe(3400);
        });

        it('TokensOutputWidget returns null when data is missing', async () => {
            const { TokensOutputWidget } = await loadWidgets();
            const widget = new TokensOutputWidget();
            const context: RenderContext = {};
            const item = { id: 'out', type: 'tokens-output' as const };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('TokensCachedWidget returns numeric value from tokenMetrics', async () => {
            const { TokensCachedWidget } = await loadWidgets();
            const widget = new TokensCachedWidget();
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 1200,
                    outputTokens: 3400,
                    cachedTokens: 560,
                    totalTokens: 5160,
                    contextLength: 0
                }
            };
            const item = { id: 'cached', type: 'tokens-cached' as const };

            expect(widget.getValueType()).toBe('number');
            expect(widget.getValue(context, item)).toBe(560);
        });

        it('TokensCachedWidget returns numeric value in preview mode', async () => {
            const { TokensCachedWidget } = await loadWidgets();
            const widget = new TokensCachedWidget();
            const context: RenderContext = { isPreview: true };
            const item = { id: 'cached', type: 'tokens-cached' as const };

            expect(widget.getValue(context, item)).toBe(12000);
        });

        it('TokensCachedWidget returns null when data is missing', async () => {
            const { TokensCachedWidget } = await loadWidgets();
            const widget = new TokensCachedWidget();
            const context: RenderContext = {};
            const item = { id: 'cached', type: 'tokens-cached' as const };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('TokensTotalWidget returns numeric value from tokenMetrics', async () => {
            const { TokensTotalWidget } = await loadWidgets();
            const widget = new TokensTotalWidget();
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 1200,
                    outputTokens: 3400,
                    cachedTokens: 560,
                    totalTokens: 5200,
                    contextLength: 0
                }
            };
            const item = { id: 'total', type: 'tokens-total' as const };

            expect(widget.getValueType()).toBe('number');
            expect(widget.getValue(context, item)).toBe(5200);
        });

        it('TokensTotalWidget returns numeric value in preview mode', async () => {
            const { TokensTotalWidget } = await loadWidgets();
            const widget = new TokensTotalWidget();
            const context: RenderContext = { isPreview: true };
            const item = { id: 'total', type: 'tokens-total' as const };

            expect(widget.getValue(context, item)).toBe(30600);
        });

        it('TokensTotalWidget returns null when data is missing', async () => {
            const { TokensTotalWidget } = await loadWidgets();
            const widget = new TokensTotalWidget();
            const context: RenderContext = {};
            const item = { id: 'total', type: 'tokens-total' as const };

            expect(widget.getValue(context, item)).toBe(null);
        });
    });
});