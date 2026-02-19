/**
 * Model-specific token pricing (USD per 1M tokens).
 * Based on Anthropic's published pricing.
 * https://docs.anthropic.com/en/docs/about-claude/models
 */

export interface ModelPricing {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheWritePerMillion: number;
    cacheReadPerMillion: number;
}

/**
 * Model family prefix → pricing. Ordered longest-prefix-first so matching
 * can short-circuit on the first hit when iterating.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    'claude-opus-4-6':   { inputPerMillion: 5,    outputPerMillion: 25,   cacheWritePerMillion: 6.25,  cacheReadPerMillion: 0.50  },
    'claude-opus-4-5':   { inputPerMillion: 5,    outputPerMillion: 25,   cacheWritePerMillion: 6.25,  cacheReadPerMillion: 0.50  },
    'claude-opus-4-1':   { inputPerMillion: 15,   outputPerMillion: 75,   cacheWritePerMillion: 18.75, cacheReadPerMillion: 1.50  },
    'claude-opus-4-':    { inputPerMillion: 15,   outputPerMillion: 75,   cacheWritePerMillion: 18.75, cacheReadPerMillion: 1.50  },
    'claude-sonnet-4-6': { inputPerMillion: 3,    outputPerMillion: 15,   cacheWritePerMillion: 3.75,  cacheReadPerMillion: 0.30  },
    'claude-sonnet-4-5': { inputPerMillion: 3,    outputPerMillion: 15,   cacheWritePerMillion: 3.75,  cacheReadPerMillion: 0.30  },
    'claude-sonnet-4-':  { inputPerMillion: 3,    outputPerMillion: 15,   cacheWritePerMillion: 3.75,  cacheReadPerMillion: 0.30  },
    'claude-sonnet-3-7': { inputPerMillion: 3,    outputPerMillion: 15,   cacheWritePerMillion: 3.75,  cacheReadPerMillion: 0.30  },
    'claude-haiku-4-5':  { inputPerMillion: 1,    outputPerMillion: 5,    cacheWritePerMillion: 1.25,  cacheReadPerMillion: 0.10  },
    'claude-haiku-3-5':  { inputPerMillion: 0.80, outputPerMillion: 4,    cacheWritePerMillion: 1.00,  cacheReadPerMillion: 0.08  },
    'claude-haiku-3':    { inputPerMillion: 0.25, outputPerMillion: 1.25, cacheWritePerMillion: 0.30,  cacheReadPerMillion: 0.03  }
};

/** Sorted prefixes longest-first for matching. */
const SORTED_PREFIXES = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);

/** Default fallback when model is unknown (Sonnet 4.6 — most common in Claude Code). */
export const DEFAULT_PRICING: ModelPricing = {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.30
};

/**
 * Resolve pricing for a model ID by longest prefix match.
 */
export function getPricingForModel(modelId?: string): ModelPricing {
    if (!modelId)
        return DEFAULT_PRICING;
    for (const prefix of SORTED_PREFIXES) {
        const pricing = MODEL_PRICING[prefix];
        if (modelId.startsWith(prefix) && pricing) {
            return pricing;
        }
    }
    return DEFAULT_PRICING;
}

/**
 * Estimate USD cost from token counts, optionally using model-specific pricing.
 */
export function estimateCostUsd(
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number,
    cacheReadTokens: number,
    modelId?: string
): number {
    const pricing = getPricingForModel(modelId);
    return (
        inputTokens * pricing.inputPerMillion
        + outputTokens * pricing.outputPerMillion
        + cacheCreationTokens * pricing.cacheWritePerMillion
        + cacheReadTokens * pricing.cacheReadPerMillion
    ) / 1_000_000;
}