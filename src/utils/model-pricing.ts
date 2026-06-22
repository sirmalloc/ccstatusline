// Per-million-token USD prices by model family. Source: Anthropic pricing
// (input / output). Cache write is billed at 1.25x input (5m TTL), cache read
// at 0.1x input — the standard ephemeral-cache multipliers.
interface ModelPrice {
    inputPerMTok: number;
    outputPerMTok: number;
}

const PRICES: { match: (id: string) => boolean; price: ModelPrice }[] = [
    { match: id => id.includes('fable') || id.includes('mythos'), price: { inputPerMTok: 10, outputPerMTok: 50 } },
    { match: id => id.includes('haiku'), price: { inputPerMTok: 1, outputPerMTok: 5 } },
    { match: id => id.includes('sonnet'), price: { inputPerMTok: 3, outputPerMTok: 15 } },
    { match: id => id.includes('opus'), price: { inputPerMTok: 5, outputPerMTok: 25 } }
];

// Default to Opus-tier pricing for unknown models (Claude Code's default tier).
const DEFAULT_PRICE: ModelPrice = { inputPerMTok: 5, outputPerMTok: 25 };

function priceFor(modelId: string): ModelPrice {
    const id = modelId.toLowerCase();
    for (const entry of PRICES) {
        if (entry.match(id)) {
            return entry.price;
        }
    }
    return DEFAULT_PRICE;
}

export interface ModelUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
}

export function costForUsage(modelId: string, usage: ModelUsage): number {
    const price = priceFor(modelId);
    const inPerTok = price.inputPerMTok / 1_000_000;
    const outPerTok = price.outputPerMTok / 1_000_000;
    return (
        usage.inputTokens * inPerTok
        + usage.outputTokens * outPerTok
        + usage.cacheCreationTokens * inPerTok * 1.25
        + usage.cacheReadTokens * inPerTok * 0.1
    );
}
