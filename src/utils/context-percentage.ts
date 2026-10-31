import type { RenderContext } from '../types';

import { getContextWindowMetrics } from './context-window';
import {
    getContextConfig,
    getContextWindowEnvOverride,
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

    // Reported percentages use the reported window, which an explicit override
    // replaces. Keep token counts (including those inferred from that original
    // window) and recalculate against the effective size instead.
    if (contextWindowMetrics.usedPercentage !== null && getContextWindowEnvOverride() === null) {
        return {
            usedPercentage: contextWindowMetrics.usedPercentage,
            windowSize: contextConfig.maxTokens
        };
    }

    const contextLength = contextWindowMetrics.contextLengthTokens ?? context.tokenMetrics?.contextLength;
    if (contextLength === undefined) {
        return null;
    }

    return {
        usedPercentage: Math.min(100, (contextLength / contextConfig.maxTokens) * 100),
        windowSize: contextConfig.maxTokens
    };
}

/**
 * Calculate context window usage percentage based on model's max tokens.
 */
export function calculateContextPercentage(context: RenderContext): number {
    return calculateContextPercentageMetrics(context)?.usedPercentage ?? 0;
}
