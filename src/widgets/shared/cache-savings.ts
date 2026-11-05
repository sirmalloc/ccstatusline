import type { RenderContext } from '../../types/RenderContext';
import type { TurnCacheTokens } from '../../utils/context-window';

interface ModelCachePricing {
    inputUsdPerMillion: number;
    cacheReadUsdPerMillion: number;
    cacheWrite5mUsdPerMillion: number;
}

// Standard Claude API prices. Transcript usage does not expose whether writes
// used 5-minute or 1-hour TTLs, so the estimate uses the 5-minute write rate.
// Rates: https://platform.claude.com/docs/en/about-claude/pricing
const MODEL_CACHE_PRICING: { pattern: RegExp; pricing: ModelCachePricing }[] = [
    { pattern: /(?:claude-)?(?:fable|mythos)[- ]?5[.-]?1/i, pricing: { inputUsdPerMillion: 10, cacheReadUsdPerMillion: 0.25, cacheWrite5mUsdPerMillion: 12.5 } },
    { pattern: /(?:claude-)?(?:fable|mythos)[- ]?5(?:\D|$)/i, pricing: { inputUsdPerMillion: 10, cacheReadUsdPerMillion: 1, cacheWrite5mUsdPerMillion: 12.5 } },
    { pattern: /(?:claude-)?opus[- ]?5[.-]?5/i, pricing: { inputUsdPerMillion: 4, cacheReadUsdPerMillion: 0.2, cacheWrite5mUsdPerMillion: 5 } },
    { pattern: /(?:claude-)?opus[- ]?5(?:\D|$)|(?:claude-)?opus[- ]?4[.-]?[5-8](?:\D|$)/i, pricing: { inputUsdPerMillion: 5, cacheReadUsdPerMillion: 0.5, cacheWrite5mUsdPerMillion: 6.25 } },
    { pattern: /(?:claude-)?opus[- ]?4(?:[.-]?[01])?(?:\D|$)/i, pricing: { inputUsdPerMillion: 15, cacheReadUsdPerMillion: 1.5, cacheWrite5mUsdPerMillion: 18.75 } },
    { pattern: /(?:claude-)?sonnet[- ]?5[.-]?5/i, pricing: { inputUsdPerMillion: 2, cacheReadUsdPerMillion: 0.1, cacheWrite5mUsdPerMillion: 2.5 } },
    { pattern: /(?:claude-)?sonnet[- ]?5(?:\D|$)/i, pricing: { inputUsdPerMillion: 2, cacheReadUsdPerMillion: 0.2, cacheWrite5mUsdPerMillion: 2.5 } },
    { pattern: /(?:claude-)?sonnet[- ]?4(?:[.-]?[0-6])?(?:\D|$)/i, pricing: { inputUsdPerMillion: 3, cacheReadUsdPerMillion: 0.3, cacheWrite5mUsdPerMillion: 3.75 } },
    { pattern: /(?:claude-)?haiku[- ]?5[.-]?5/i, pricing: { inputUsdPerMillion: 0.5, cacheReadUsdPerMillion: 0.05, cacheWrite5mUsdPerMillion: 0.625 } },
    { pattern: /(?:claude-)?haiku[- ]?4[.-]?5/i, pricing: { inputUsdPerMillion: 1, cacheReadUsdPerMillion: 0.1, cacheWrite5mUsdPerMillion: 1.25 } },
    { pattern: /(?:claude-)?haiku[- ]?3[.-]?5/i, pricing: { inputUsdPerMillion: 0.8, cacheReadUsdPerMillion: 0.08, cacheWrite5mUsdPerMillion: 1 } }
];

export function getPromptCacheSavings(context: RenderContext, tokens: TurnCacheTokens): number | null {
    const model = context.data?.model;
    const identity = typeof model === 'string' ? model : `${model?.id ?? ''} ${model?.display_name ?? ''}`;
    const pricing = MODEL_CACHE_PRICING.find(entry => entry.pattern.test(identity))?.pricing;
    if (!pricing) {
        return null;
    }

    const baselineUsd = (tokens.read + tokens.creation) * pricing.inputUsdPerMillion / 1_000_000;
    const cachedUsd = tokens.read * pricing.cacheReadUsdPerMillion / 1_000_000
        + tokens.creation * pricing.cacheWrite5mUsdPerMillion / 1_000_000;
    return baselineUsd - cachedUsd;
}
