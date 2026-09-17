export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface TranscriptLine {
    message?: { id?: string; model?: string; usage?: TokenUsage; stop_reason?: string | null };
    isSidechain?: boolean;
    timestamp?: string;
    isApiErrorMessage?: boolean;
    type?: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot';
}

// Estimated USD cost per token category, weighted by each turn's own model
// (so a mid-session model switch prices historical turns correctly). Relative
// only -- see getCostBreakdown in widgets/shared/cost-metrics.ts, which scales
// these to Claude Code's own reported total before a widget displays them.
export interface CostEstimate {
    inputCost: number;
    outputCost: number;
    cacheWriteCost: number;
    cacheReadCost: number;
}

export interface TokenMetrics {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    // Hot (cache read) and cold (cache creation) split of cachedTokens.
    // Optional so existing TokenMetrics literals stay valid; getTokenMetrics always sets them.
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalTokens: number;
    contextLength: number;
    costEstimate?: CostEstimate;
}
