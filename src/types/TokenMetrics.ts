export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface TranscriptLine {
    message?: { id?: string; usage?: TokenUsage; stop_reason?: string | null };
    isSidechain?: boolean;
    // Index of the content block this line carries within its API response.
    // Claude Code writes one line per block (thinking, text, tool_use, ...) and
    // repeats the same `usage` on each of them, so only block 0 is billable.
    apiBlockIndex?: number;
    timestamp?: string;
    isApiErrorMessage?: boolean;
    type?: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot';
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
}
