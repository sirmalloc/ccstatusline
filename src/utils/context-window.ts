import type { StatusJSON } from '../types/StatusJSON';

export interface ContextWindowMetrics {
    windowSize: number | null;
    usedTokens: number | null;
    contextLengthTokens: number | null;
    usedPercentage: number | null;
    remainingPercentage: number | null;
    totalInputTokens: number | null;
    totalOutputTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
}

function toFiniteNonNegativeNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.max(0, value);
}

function clampPercentage(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function getContextWindowMetrics(data?: StatusJSON): ContextWindowMetrics {
    const contextWindow = data?.context_window;

    if (!contextWindow) {
        return {
            windowSize: null,
            usedTokens: null,
            contextLengthTokens: null,
            usedPercentage: null,
            remainingPercentage: null,
            totalInputTokens: null,
            totalOutputTokens: null,
            cachedTokens: null,
            totalTokens: null
        };
    }

    const rawWindowSize = toFiniteNonNegativeNumber(contextWindow.context_window_size);
    const windowSize = rawWindowSize !== null && rawWindowSize > 0 ? rawWindowSize : null;
    const totalInputTokens = toFiniteNonNegativeNumber(contextWindow.total_input_tokens);
    const totalOutputTokens = toFiniteNonNegativeNumber(contextWindow.total_output_tokens);

    let currentUsageTotalTokens: number | null = null;
    let contextLengthTokens: number | null = null;
    let cachedTokens: number | null = null;

    if (typeof contextWindow.current_usage === 'number') {
        currentUsageTotalTokens = toFiniteNonNegativeNumber(contextWindow.current_usage);
        contextLengthTokens = currentUsageTotalTokens;
    } else if (contextWindow.current_usage && typeof contextWindow.current_usage === 'object') {
        const usage = contextWindow.current_usage;
        const inputTokens = toFiniteNonNegativeNumber(usage.input_tokens) ?? 0;
        const outputTokens = toFiniteNonNegativeNumber(usage.output_tokens) ?? 0;
        const cacheCreationTokens = toFiniteNonNegativeNumber(usage.cache_creation_input_tokens) ?? 0;
        const cacheReadTokens = toFiniteNonNegativeNumber(usage.cache_read_input_tokens) ?? 0;

        currentUsageTotalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
        contextLengthTokens = inputTokens + cacheCreationTokens + cacheReadTokens;
        cachedTokens = cacheCreationTokens + cacheReadTokens;
    }

    const rawUsedPercentage = toFiniteNonNegativeNumber(contextWindow.used_percentage);
    const rawRemainingPercentage = toFiniteNonNegativeNumber(contextWindow.remaining_percentage);
    const usedTokensFromPercentage = rawUsedPercentage !== null && windowSize !== null
        ? (rawUsedPercentage / 100) * windowSize
        : null;

    const usedTokens = currentUsageTotalTokens ?? usedTokensFromPercentage;

    const usedPercentage = rawUsedPercentage !== null
        ? clampPercentage(rawUsedPercentage)
        : usedTokens !== null && windowSize !== null && windowSize > 0
            ? clampPercentage((usedTokens / windowSize) * 100)
            : null;

    const remainingPercentage = rawRemainingPercentage !== null
        ? clampPercentage(rawRemainingPercentage)
        : usedPercentage !== null
            ? 100 - usedPercentage
            : null;

    const totalTokens = currentUsageTotalTokens
        ?? (totalInputTokens !== null && totalOutputTokens !== null
            ? totalInputTokens + totalOutputTokens
            : null);

    return {
        windowSize,
        usedTokens,
        contextLengthTokens: contextLengthTokens ?? usedTokens,
        usedPercentage,
        remainingPercentage,
        totalInputTokens,
        totalOutputTokens,
        cachedTokens,
        totalTokens
    };
}

export function getContextWindowInputTotalTokens(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).totalInputTokens;
}

export function getContextWindowOutputTotalTokens(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).totalOutputTokens;
}

export function getContextWindowCachedTokens(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).cachedTokens;
}

export function getContextWindowTotalTokens(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).totalTokens;
}

export function getContextWindowContextLengthTokens(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).contextLengthTokens;
}

export function getContextWindowUsedTokens(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).usedTokens;
}

export function getContextWindowUsedPercentage(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).usedPercentage;
}

export function getContextWindowSize(data?: StatusJSON): number | null {
    return getContextWindowMetrics(data).windowSize;
}