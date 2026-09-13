import type { RenderContext } from '../../types/RenderContext';

export interface CostBreakdown {
    inputCost: number;
    outputCost: number;
    cacheWriteCost: number;
    cacheReadCost: number;
}

// Claude Code reports one lump total_cost_usd, correctly priced (including
// any account-specific billing adjustments) but with no category detail. Our
// own per-model price table only supplies the *relative* weight between
// input/output/cache-write/cache-read, so this scales that estimate to sum to
// Claude Code's own total rather than trusting the estimate's absolute value,
// which would drift as pricing changes or under billing setups we can't see
// (e.g. a provider-specific rate).
export function getCostBreakdown(context: RenderContext): CostBreakdown | null {
    const estimate = context.tokenMetrics?.costEstimate;
    const totalCost = context.data?.cost?.total_cost_usd;
    if (!estimate || totalCost === undefined) {
        return null;
    }

    if (totalCost <= 0) {
        return { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0 };
    }

    const estimatedTotal = estimate.inputCost + estimate.outputCost + estimate.cacheWriteCost + estimate.cacheReadCost;
    if (estimatedTotal <= 0) {
        return null;
    }

    const scale = totalCost / estimatedTotal;
    return {
        inputCost: estimate.inputCost * scale,
        outputCost: estimate.outputCost * scale,
        cacheWriteCost: estimate.cacheWriteCost * scale,
        cacheReadCost: estimate.cacheReadCost * scale
    };
}
