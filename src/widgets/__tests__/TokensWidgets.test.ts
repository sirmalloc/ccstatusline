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

    it('prefers cumulative tokenMetrics for all token widgets when both sources are present', async () => {
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

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:9999');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:9999');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: fmt:9999');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: fmt:9999');
    });

    it('falls back to context_window totals for input/output when tokenMetrics is missing', async () => {
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
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:1111');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:2222');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders token metrics when context_window data is missing', async () => {
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

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:1200');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:3400');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:560');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:5160');
    });

    it('hides zero counts only when the zero hide state is enabled', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:0');
        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('applies number formatting without bypassing zero hiding', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 1000,
                outputTokens: 2000,
                cachedTokens: 3000,
                totalTokens: 6000,
                contextLength: 0
            }
        };
        const numberFormat = { style: 'compact' as const };

        new TokensInputWidget().render({ id: 'in', type: 'tokens-input', numberFormat }, context, DEFAULT_SETTINGS);
        new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', numberFormat }, context, DEFAULT_SETTINGS);
        new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', numberFormat }, context, DEFAULT_SETTINGS);
        new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', numberFormat }, context, DEFAULT_SETTINGS);

        expect(renderer.formatTokens).toHaveBeenNthCalledWith(1, 1000, numberFormat);
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(2, 2000, numberFormat);
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(3, 3000, numberFormat);
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(4, 6000, numberFormat);

        const zeroContext: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0
            }
        };
        expect(new TokensInputWidget().render({
            id: 'hidden',
            type: 'tokens-input',
            numberFormat,
            metadata: { hide: 'zero' }
        }, zeroContext, DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders nothing for input and output when neither tokenMetrics nor context_window has data', async () => {
        const { TokensInputWidget, TokensOutputWidget } = await loadWidgets();

        for (const context of [{}, { data: {} }, { tokenMetrics: null }] as RenderContext[]) {
            expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBeNull();
            expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBeNull();
        }
    });

    it('keeps a zero tokenMetrics count over the context_window totals for input and output', async () => {
        const { TokensInputWidget, TokensOutputWidget } = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    total_input_tokens: 1111,
                    total_output_tokens: 2222
                }
            },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:0');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:0');
        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('hides a zero context_window fallback when the zero hide state is enabled', async () => {
        const { TokensInputWidget, TokensOutputWidget } = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    total_input_tokens: 0,
                    total_output_tokens: 0
                }
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:0');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:0');
        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('keeps non-zero counts and the preview sample when zero counts are hidden', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const metadata = { hide: 'zero' };
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 1,
                outputTokens: 2,
                cachedTokens: 3,
                totalTokens: 6,
                contextLength: 0
            }
        };
        const previewZeroContext: RenderContext = {
            isPreview: true,
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', metadata }, context, DEFAULT_SETTINGS)).toBe('In: fmt:1');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', metadata }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:2');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', metadata }, context, DEFAULT_SETTINGS)).toBe('Cached: fmt:3');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', metadata }, context, DEFAULT_SETTINGS)).toBe('Total: fmt:6');

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', metadata }, previewZeroContext, DEFAULT_SETTINGS)).toBe('In: fmt:15200');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', metadata }, previewZeroContext, DEFAULT_SETTINGS)).toBe('Out: fmt:3400');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', metadata }, previewZeroContext, DEFAULT_SETTINGS)).toBe('Cached: fmt:12000');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', metadata }, previewZeroContext, DEFAULT_SETTINGS)).toBe('Total: fmt:30600');
    });

    it('resolves a global token number format over the widget format', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 1000,
                outputTokens: 2000,
                cachedTokens: 3000,
                totalTokens: 6000,
                contextLength: 0
            }
        };
        const settings = { ...DEFAULT_SETTINGS, numberFormat: { token: { style: 'whole' as const }, cost: { decimals: 4 } } };
        const numberFormat = { style: 'compact' as const };

        new TokensInputWidget().render({ id: 'in', type: 'tokens-input', numberFormat }, context, settings);
        new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', numberFormat }, context, settings);
        new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', numberFormat }, context, settings);
        new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', numberFormat }, { isPreview: true }, settings);

        expect(renderer.formatTokens).toHaveBeenNthCalledWith(1, 1000, { style: 'whole' });
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(2, 2000, { style: 'whole' });
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(3, 3000, { style: 'whole' });
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(4, 30600, { style: 'whole' });
    });

    it('describes each token widget and its editor row', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const cases = [
            { widget: new TokensInputWidget(), type: 'tokens-input', name: 'Tokens Input', color: 'blue', description: 'Shows input token count for the current session' },
            { widget: new TokensOutputWidget(), type: 'tokens-output', name: 'Tokens Output', color: 'white', description: 'Shows output token count for the current session' },
            { widget: new TokensCachedWidget(), type: 'tokens-cached', name: 'Tokens Cached', color: 'cyan', description: 'Shows cached token count for the current session' },
            { widget: new TokensTotalWidget(), type: 'tokens-total', name: 'Tokens Total', color: 'cyan', description: 'Shows total token count (input + output + cache) for the current session' }
        ];

        for (const { widget, type, name, color, description } of cases) {
            const item = { id: type, type, rawValue: true, metadata: { hide: 'zero' }, numberFormat: { style: 'compact' as const } };

            expect(widget.getDisplayName()).toBe(name);
            expect(widget.getDescription()).toBe(description);
            expect(widget.getDefaultColor()).toBe(color);
            expect(widget.getCategory()).toBe('Tokens');
            expect(widget.getEditorDisplay(item)).toEqual({ displayText: name });
            expect(widget.getHideableStates()).toEqual([{ key: 'zero', label: 'when token count is zero' }]);
            expect(widget.supportsRawValue()).toBe(true);
            expect(widget.supportsColors(item)).toBe(true);
            expect(widget.supportsNumberFormat()).toBe(true);
        }
    });

    it('declares the zero hideable state for all token widgets', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();

        for (const widget of [new TokensInputWidget(), new TokensOutputWidget(), new TokensCachedWidget(), new TokensTotalWidget()]) {
            expect(widget.getHideableStates().map(state => state.key)).toEqual(['zero']);
        }
    });

    it('renders expected preview labels and raw values for all token widgets', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = { isPreview: true };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: fmt:15200');
        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:15200');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: fmt:3400');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:3400');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: fmt:12000');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:12000');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: fmt:30600');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:30600');
    });

    it('formats every preview sample with the selected token style', async () => {
        const { TokensCachedWidget, TokensInputWidget, TokensOutputWidget, TokensTotalWidget } = await loadWidgets();
        const context: RenderContext = { isPreview: true };
        const numberFormat = { style: 'whole' as const };

        new TokensInputWidget().render({ id: 'in', type: 'tokens-input', numberFormat }, context, DEFAULT_SETTINGS);
        new TokensOutputWidget().render({ id: 'out', type: 'tokens-output', numberFormat }, context, DEFAULT_SETTINGS);
        new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached', numberFormat }, context, DEFAULT_SETTINGS);
        new TokensTotalWidget().render({ id: 'total', type: 'tokens-total', numberFormat }, context, DEFAULT_SETTINGS);

        expect(renderer.formatTokens).toHaveBeenNthCalledWith(1, 15200, numberFormat);
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(2, 3400, numberFormat);
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(3, 12000, numberFormat);
        expect(renderer.formatTokens).toHaveBeenNthCalledWith(4, 30600, numberFormat);
    });
});
