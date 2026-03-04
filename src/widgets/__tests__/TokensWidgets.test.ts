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
});