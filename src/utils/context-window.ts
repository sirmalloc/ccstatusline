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

interface CurrentUsageObject {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

interface CurrentUsageTokens {
    input: number;
    output: number;
    creation: number;
    read: number;
}

function parseCurrentUsageTokens(usage: CurrentUsageObject): CurrentUsageTokens {
    return {
        input: toFiniteNonNegativeNumber(usage.input_tokens) ?? 0,
        output: toFiniteNonNegativeNumber(usage.output_tokens) ?? 0,
        creation: toFiniteNonNegativeNumber(usage.cache_creation_input_tokens) ?? 0,
        read: toFiniteNonNegativeNumber(usage.cache_read_input_tokens) ?? 0
    };
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
        const { input, output, creation, read } = parseCurrentUsageTokens(contextWindow.current_usage);

        currentUsageTotalTokens = input + output + creation + read;
        contextLengthTokens = input + creation + read;
        cachedTokens = creation + read;
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

    // Treat all-zero usage frames as missing data — Claude Code occasionally
    // emits transient frames where used_percentage is 0 and all token counts
    // are 0 mid-session. Returning null forces callers to fall through to
    // transcript-based metrics instead of flashing "0k".
    const isAllZero = usedPercentage === 0 && (usedTokens === null || usedTokens === 0);
    if (isAllZero) {
        return {
            windowSize,
            usedTokens: null,
            contextLengthTokens: null,
            usedPercentage: null,
            remainingPercentage: null,
            totalInputTokens,
            totalOutputTokens,
            cachedTokens: null,
            totalTokens: null
        };
    }

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

export interface TurnCacheTokens {
    read: number;
    creation: number;
    input: number;
}

// Cache read/creation/input tokens for the most recent turn ("last action"),
// taken directly from Claude Code's live status JSON (context_window.current_usage).
// Returns null when the object form of current_usage is unavailable.
export function getContextWindowTurnCacheTokens(data?: StatusJSON): TurnCacheTokens | null {
    const usage = data?.context_window?.current_usage;
    if (!usage || typeof usage !== 'object') {
        return null;
    }

    const { input, creation, read } = parseCurrentUsageTokens(usage);
    return { read, creation, input };
}
