import {
    describe,
    expect,
    it
} from 'vitest';

import { getModelPriceRatios } from '../model-pricing';

describe('getModelPriceRatios', () => {
    it('matches a real Bedrock-style model id', () => {
        expect(getModelPriceRatios('claude-sonnet-5')).toEqual({ input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 });
    });

    it('matches a dated model id with a numeric suffix', () => {
        expect(getModelPriceRatios('claude-haiku-4-5-20251001')).toEqual({ input: 1, output: 5, cacheWrite: 2, cacheRead: 0.1 });
    });

    it('prefers the more specific Fable 5.1 entry over the Fable 5 entry', () => {
        expect(getModelPriceRatios('fable-5.1')).toEqual({ input: 10, output: 50, cacheWrite: 20, cacheRead: 0.25 });
        expect(getModelPriceRatios('fable-5')).toEqual({ input: 10, output: 50, cacheWrite: 20, cacheRead: 1 });
    });

    it('uses the newer 5.2 and 5.5 prices, not the older 5 prices', () => {
        expect(getModelPriceRatios('claude-fable-5-2')).toEqual({ input: 8, output: 40, cacheWrite: 16, cacheRead: 0.2 });
        expect(getModelPriceRatios('claude-opus-5-5')).toEqual({ input: 4, output: 20, cacheWrite: 8, cacheRead: 0.2 });
        expect(getModelPriceRatios('claude-sonnet-5-5')).toEqual({ input: 2, output: 10, cacheWrite: 4, cacheRead: 0.1 });
        expect(getModelPriceRatios('claude-haiku-5-5')).toEqual({ input: 0.1, output: 0.5, cacheWrite: 0.2, cacheRead: 0.01 });
        expect(getModelPriceRatios('claude-opus-5')).toEqual({ input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 });
    });

    it('does not confuse Sonnet 5 with Sonnet 4.5', () => {
        expect(getModelPriceRatios('claude-sonnet-4-5')).toEqual({ input: 3, output: 15, cacheWrite: 6, cacheRead: 0.3 });
        expect(getModelPriceRatios('claude-sonnet-5')).toEqual({ input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 });
    });

    it('falls back to the default ratios for an unrecognized model id', () => {
        expect(getModelPriceRatios('some-future-model')).toEqual({ input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 });
    });

    it('falls back to the default ratios when no model id is given', () => {
        expect(getModelPriceRatios(undefined)).toEqual({ input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 });
    });
});
