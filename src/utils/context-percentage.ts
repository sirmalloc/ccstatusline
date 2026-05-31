import type { RenderContext } from '../types';

import { getContextWindowMetrics } from './context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from './model-context';

export interface ContextPercentageMetrics {
    usedPercentage: number;
    windowSize: number | null;
}

/**
 * Calculate context window usage percentage and the denominator used for that
 * percentage. Returns null when neither status JSON nor transcript metrics can
 * provide context usage.
 */
export function calculateContextPercentageMetrics(context: Pick<RenderContext, 'data' | 'tokenMetrics'>): ContextPercentageMetrics | null {
    const contextWindowMetrics = getContextWindowMetrics(context.data);
    const modelIdentifier = getModelContextIdentifier(context.data?.model);
    const contextConfig = getContextConfig(modelIdentifier, contextWindowMetrics.windowSize);

    if (contextWindowMetrics.usedPercentage !== null) {
        return {
            usedPercentage: contextWindowMetrics.usedPercentage,
            windowSize: contextConfig.maxTokens
        };
    }

    if (!context.tokenMetrics) {
        return null;
    }

    return {
        usedPercentage: Math.min(100, (context.tokenMetrics.contextLength / contextConfig.maxTokens) * 100),
        windowSize: contextConfig.maxTokens
    };
}

/**
 * Calculate context window usage percentage based on model's max tokens.
 */
export function calculateContextPercentage(context: RenderContext): number {
    return calculateContextPercentageMetrics(context)?.usedPercentage ?? 0;
}
