import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { CostCacheReadWidget } from '../CostCacheRead';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    const widget = new CostCacheReadWidget();
    return widget.render(item, context, DEFAULT_SETTINGS);
}

function contextWith(totalCost: number, costEstimate: {
    inputCost: number;
    outputCost: number;
    cacheWriteCost: number;
    cacheReadCost: number;
}): RenderContext {
    return {
        data: { cost: { total_cost_usd: totalCost } },
        tokenMetrics: {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength: 0,
            costEstimate
        }
    };
}

describe('CostCacheReadWidget', () => {
    it('scales the cache-read cost estimate to match the real session total', () => {
        const context = contextWith(4, { inputCost: 0.5, outputCost: 1, cacheWriteCost: 0.3, cacheReadCost: 0.2 });
        expect(render({ id: 'cost-cache-read', type: 'cost-cache-read' }, context)).toBe('CacheR $0.40');
    });

    it('renders nothing when cost data is missing', () => {
        expect(render({ id: 'cost-cache-read', type: 'cost-cache-read' }, {})).toBeNull();
    });

    it('renders nothing when the estimated total is zero but the real total is not', () => {
        // Should not happen in practice (cost always comes with tokens), but
        // must not divide by zero or fabricate a number.
        const context = contextWith(4, { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0 });
        expect(render({ id: 'cost-cache-read', type: 'cost-cache-read' }, context)).toBeNull();
    });

    it('formats the preview sample', () => {
        expect(render({ id: 'cost-cache-read', type: 'cost-cache-read' }, { isPreview: true })).toBe('CacheR $0.21');
    });

    it('declares the zero hideable state', () => {
        expect(new CostCacheReadWidget().getHideableStates().map(state => state.key)).toEqual(['zero']);
    });

    it('hides $0.00 only when the zero hide state is enabled', () => {
        const context = contextWith(0, { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0 });

        expect(render({ id: 'cost-cache-read', type: 'cost-cache-read' }, context)).toBe('CacheR $0.00');
        expect(render({
            id: 'cost-cache-read',
            type: 'cost-cache-read',
            metadata: { hide: 'zero' }
        }, context)).toBeNull();
    });
});
