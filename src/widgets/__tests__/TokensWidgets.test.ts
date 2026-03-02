import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { TokensCachedWidget } from '../TokensCached';
import { TokensInputWidget } from '../TokensInput';
import { TokensOutputWidget } from '../TokensOutput';
import { TokensTotalWidget } from '../TokensTotal';

describe('Token widgets', () => {
    it('use context_window values for input/output and tokenMetrics totals for cached/total', () => {
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

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: 1.1k');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: 2.2k');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: 10.0k');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: 10.0k');
    });

    it('fall back to token metrics when context_window data is missing', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 1200,
                outputTokens: 3400,
                cachedTokens: 560,
                totalTokens: 5160,
                contextLength: 0
            }
        };

        expect(new TokensInputWidget().render({ id: 'in', type: 'tokens-input' }, context, DEFAULT_SETTINGS)).toBe('In: 1.2k');
        expect(new TokensOutputWidget().render({ id: 'out', type: 'tokens-output' }, context, DEFAULT_SETTINGS)).toBe('Out: 3.4k');
        expect(new TokensCachedWidget().render({ id: 'cached', type: 'tokens-cached' }, context, DEFAULT_SETTINGS)).toBe('Cached: 560');
        expect(new TokensTotalWidget().render({ id: 'total', type: 'tokens-total' }, context, DEFAULT_SETTINGS)).toBe('Total: 5.2k');
    });
});