import type { RenderContext } from '../types';

import { getContextWindowMetrics } from './context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from './model-context';

/**
 * Calculate context window usage percentage based on model's max tokens
 */
export function calculateContextPercentage(context: RenderContext): number {
    const contextWindowMetrics = getContextWindowMetrics(context.data);
    if (contextWindowMetrics.usedPercentage !== null) {
        return contextWindowMetrics.usedPercentage;
    }

    if (!context.tokenMetrics) {
        return 0;
    }

    const modelIdentifier = getModelContextIdentifier(context.data?.model);
    const contextConfig = getContextConfig(modelIdentifier, contextWindowMetrics.windowSize);

    return Math.min(100, (context.tokenMetrics.contextLength / contextConfig.maxTokens) * 100);
}