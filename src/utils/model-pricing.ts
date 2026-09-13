export interface ModelPriceRatios {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}

// USD per 1M tokens, Anthropic API list pricing at each model's release. Used
// only to weigh input/output/cache-write/cache-read against each other when
// splitting a session's already-known total cost (see getCostBreakdown in
// widgets/shared/cost-metrics.ts) -- never to compute an absolute dollar
// figure on their own. An outdated or missing entry only skews the split
// between categories, not the total, since the total always comes from
// Claude Code's own reported cost.
//
// Longest/most-specific match must come first within a family: "fable5"
// would otherwise match a "fable 5.1" id before its own, more specific, row
// is reached.
const MODEL_PRICE_TABLE: { needles: string[]; prices: ModelPriceRatios }[] = [
    { needles: ['fable51', 'mythos51'], prices: { input: 10, output: 50, cacheWrite: 20, cacheRead: 0.25 } },
    { needles: ['fable5'], prices: { input: 10, output: 50, cacheWrite: 20, cacheRead: 1 } },
    { needles: ['opus5'], prices: { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 } },
    { needles: ['sonnet5'], prices: { input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 } },
    { needles: ['opus48', 'opus47', 'opus46', 'opus45'], prices: { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 } },
    { needles: ['sonnet46', 'sonnet45'], prices: { input: 3, output: 15, cacheWrite: 6, cacheRead: 0.3 } },
    { needles: ['haiku45'], prices: { input: 1, output: 5, cacheWrite: 2, cacheRead: 0.1 } }
];

// Falls back to Sonnet-tier ratios for an unrecognized or missing model id,
// which only matters for the relative split (see above), so a future model
// this table doesn't know about yet still gets a reasonable category split.
const DEFAULT_PRICE_RATIOS: ModelPriceRatios = { input: 2, output: 10, cacheWrite: 4, cacheRead: 0.2 };

function normalizeModelId(model: string): string {
    return model.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getModelPriceRatios(model: string | undefined): ModelPriceRatios {
    if (!model) {
        return DEFAULT_PRICE_RATIOS;
    }

    const normalized = normalizeModelId(model);
    for (const { needles, prices } of MODEL_PRICE_TABLE) {
        if (needles.some(needle => normalized.includes(needle))) {
            return prices;
        }
    }

    return DEFAULT_PRICE_RATIOS;
}
