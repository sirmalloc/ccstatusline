export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface TranscriptLine {
    message?: { id?: string; usage?: TokenUsage; stop_reason?: string | null };
    isSidechain?: boolean;
    timestamp?: string;
    isApiErrorMessage?: boolean;
    type?: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot';
}

// Token usage of a single assistant API call (one message id). Claude Code
// writes one JSONL entry per content block sharing that id, so the values are
// deduplicated, not summed across entries.
export interface LastTurnTokens {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
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
    // Only populated when the scan option includeLastTurnTokens is set.
    lastTurnTokens?: LastTurnTokens;
}
