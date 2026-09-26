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

describe('TokensLastTurn widget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(renderer, 'formatTokens').mockImplementation((value: number) => `fmt:${value}`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the deduplicated last-turn total with a Turn label', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 99999,
                outputTokens: 99999,
                cachedTokens: 99999,
                totalTokens: 99999,
                contextLength: 99999,
                lastTurnTokens: {
                    inputTokens: 100,
                    outputTokens: 250,
                    cachedTokens: 4000,
                    totalTokens: 4350
                }
            }
        };

        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn' }, context, DEFAULT_SETTINGS)).toBe('Turn: fmt:4350');
    });

    it('renders null when no last-turn data was collected', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 999,
                outputTokens: 999,
                cachedTokens: 999,
                totalTokens: 999,
                contextLength: 999
            }
        };

        // RenderContext without tokenMetrics (live status JSON only) hides it too.
        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn' }, context, DEFAULT_SETTINGS)).toBeNull();
        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn' }, {}, DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders raw values without the label', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0,
                lastTurnTokens: {
                    inputTokens: 12,
                    outputTokens: 34,
                    cachedTokens: 56,
                    totalTokens: 102
                }
            }
        };

        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:102');
    });

    it('hides zero counts only when the zero hide state is enabled', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0,
                lastTurnTokens: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0
                }
            }
        };

        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn' }, context, DEFAULT_SETTINGS)).toBe('Turn: fmt:0');
        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn', metadata: { hide: 'zero' } }, context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('passes the number format through to formatTokens', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 0,
                lastTurnTokens: {
                    inputTokens: 1,
                    outputTokens: 2,
                    cachedTokens: 3,
                    totalTokens: 6
                }
            }
        };
        const numberFormat = { style: 'compact' as const };

        new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn', numberFormat }, context, DEFAULT_SETTINGS);

        expect(renderer.formatTokens).toHaveBeenCalledWith(6, numberFormat);
    });

    it('renders preview labels and raw values', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');
        const context: RenderContext = { isPreview: true };

        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn' }, context, DEFAULT_SETTINGS)).toBe('Turn: fmt:2900');
        expect(new TokensLastTurnWidget().render({ id: 'last', type: 'tokens-last-turn', rawValue: true }, context, DEFAULT_SETTINGS)).toBe('fmt:2900');
    });

    it('declares the zero hideable state', async () => {
        const { TokensLastTurnWidget } = await import('../TokensLastTurn');

        expect(new TokensLastTurnWidget().getHideableStates().map(state => state.key)).toEqual(['zero']);
    });
});
