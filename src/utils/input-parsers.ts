import type { TokenMetrics } from '../types';
import type { ContextWindow } from '../types/StatusJSON';

import { getContextConfig } from './model-context';

/**
 * Formats a duration in milliseconds to a human-readable string
 */
export function formatDurationMs(durationMs: number): string {
    const totalMinutes = Math.floor(durationMs / (1000 * 60));

    if (totalMinutes < 1) {
        return '<1m';
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    } else if (minutes === 0) {
        return `${hours}hr`;
    } else {
        return `${hours}hr ${minutes}m`;
    }
}

/**
 * Extracts token metrics from the context_window object in the status JSON
 */
export function extractTokenMetricsFromContextWindow(
    contextWindow: ContextWindow | undefined,
    modelId: string | undefined
): TokenMetrics | null {
    if (!contextWindow)
        return null;

    const inputTokens = contextWindow.total_input_tokens ?? 0;
    const outputTokens = contextWindow.total_output_tokens ?? 0;
    const cacheCreation = contextWindow.current_usage?.cache_creation_input_tokens ?? 0;
    const cacheRead = contextWindow.current_usage?.cache_read_input_tokens ?? 0;
    const cachedTokens = cacheCreation + cacheRead;
    const totalTokens = inputTokens + outputTokens + cachedTokens;
    const contextLength = (contextWindow.current_usage?.input_tokens ?? 0) + cacheCreation + cacheRead;
    const contextWindowSize = contextWindow.context_window_size ?? getContextConfig(modelId);
    const usedPercentage = contextWindow.used_percentage ?? Math.min(100, contextLength / contextWindowSize * 100);
    const remainingPercentage = contextWindow.remaining_percentage ?? Math.max(0, 100 - usedPercentage);

    return {
        inputTokens,
        outputTokens,
        cachedTokens,
        totalTokens,
        contextLength,
        contextWindowSize,
        usedPercentage,
        remainingPercentage
    };
}