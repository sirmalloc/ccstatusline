import type { RenderContext } from '../types';

import { getContextConfig } from './model-context';

/**
 * Calculate context window usage percentage based on model's max tokens
 */
export function calculateContextPercentage(context: RenderContext): number {
    if (!context.tokenMetrics) {
        return 0;
    }

    const modelId = context.data?.model?.id;
    const contextConfig = getContextConfig(modelId);

    return Math.min(100, (context.tokenMetrics.contextLength / contextConfig.maxTokens) * 100);
}