import type { NumberFormat } from '../../types/NumberFormat';
import type { RenderContext } from '../../types/RenderContext';
import {
    getContextWindowTurnCacheTokens,
    type TurnCacheTokens
} from '../../utils/context-window';
import { formatPercent } from '../../utils/number-format';
import { formatTokens } from '../../utils/renderer';

// Resolves the cache token triple for either scope:
// - turn: Claude Code's live status JSON (context_window.current_usage)
// - session: cumulative transcript totals (tokenMetrics)
// Returns null when the relevant data source is unavailable.
export function getCacheTokens(context: RenderContext, sessionScope: boolean): TurnCacheTokens | null {
    if (sessionScope) {
        const metrics = context.tokenMetrics;
        if (!metrics) {
            return null;
        }

        return {
            read: metrics.cacheReadTokens ?? 0,
            creation: metrics.cacheCreationTokens ?? 0,
            input: metrics.inputTokens
        };
    }

    return getContextWindowTurnCacheTokens(context.data);
}

// Hit rate: share of cacheable context served hot vs rewritten cold.
export function getCacheHitRate(tokens: TurnCacheTokens): number | null {
    const denominator = tokens.read + tokens.creation;
    return denominator > 0 ? (tokens.read / denominator) * 100 : null;
}

// Hot (cache read) tokens as a percentage of total prompt context.
export function getCacheReadPercentage(tokens: TurnCacheTokens): number | null {
    const denominator = tokens.input + tokens.read + tokens.creation;
    return denominator > 0 ? (tokens.read / denominator) * 100 : null;
}

// Cold (cache creation) tokens as a percentage of total prompt context.
export function getCacheWritePercentage(tokens: TurnCacheTokens): number | null {
    const denominator = tokens.input + tokens.read + tokens.creation;
    return denominator > 0 ? (tokens.creation / denominator) * 100 : null;
}

// Combines a token count with its context share: "88.0k (84.5%)".
// Falls back to the bare token count when the percentage is undefined.
export function formatTokensWithPercentage(
    tokenCount: number,
    percentage: number | null,
    tokenFormat: NumberFormat = {},
    percentFormat: NumberFormat = {}
): string {
    const tokens = formatTokens(tokenCount, tokenFormat);
    return percentage === null ? tokens : `${tokens} (${formatPercent(percentage, percentFormat)})`;
}
