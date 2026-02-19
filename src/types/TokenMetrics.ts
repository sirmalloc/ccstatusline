export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface TranscriptLine {
    message?: { model?: string; usage?: TokenUsage };
    isSidechain?: boolean;
    timestamp?: string;
    isApiErrorMessage?: boolean;
}

export interface TokenMetrics {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    contextLength: number;
}

export interface BlockTokenMetrics {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    readCostUsd: number;
    writeCostUsd: number;
    estimatedCostUsd: number;
    estimatedMaxTokens: number;
    estimatedMaxCostUsd: number;
    isMaxEstimated: boolean;
}