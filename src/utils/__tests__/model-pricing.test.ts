import {
    describe,
    expect,
    it
} from 'vitest';

import { costForUsage } from '../model-pricing';

describe('costForUsage', () => {
    it('prices Opus input + output at $5/$25 per MTok', () => {
        const cost = costForUsage('claude-opus-4-8', {
            inputTokens: 1_000_000,
            outputTokens: 1_000_000,
            cacheReadTokens: 0,
            cacheCreationTokens: 0
        });
        expect(cost).toBeCloseTo(30, 6); // 5 + 25
    });

    it('prices Sonnet and Haiku by family', () => {
        const sonnet = costForUsage('claude-sonnet-4-6', { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
        const haiku = costForUsage('claude-haiku-4-5', { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
        expect(sonnet).toBeCloseTo(3, 6);
        expect(haiku).toBeCloseTo(1, 6);
    });

    it('applies cache multipliers (1.25x write, 0.1x read) off input price', () => {
        const cost = costForUsage('claude-opus-4-8', {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 1_000_000,
            cacheReadTokens: 1_000_000
        });
        expect(cost).toBeCloseTo(5 * 1.25 + 5 * 0.1, 6); // 6.25 + 0.5
    });

    it('falls back to Opus-tier pricing for unknown models', () => {
        const cost = costForUsage('some-unknown-model', { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
        expect(cost).toBeCloseTo(5, 6);
    });
});
