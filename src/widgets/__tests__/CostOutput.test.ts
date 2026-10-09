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
import { CostOutputWidget } from '../CostOutput';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    const widget = new CostOutputWidget();
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

describe('CostOutputWidget', () => {
    it('scales the output-cost estimate to match the real session total', () => {
        const context = contextWith(4, { inputCost: 0.5, outputCost: 1, cacheWriteCost: 0.3, cacheReadCost: 0.2 });
        expect(render({ id: 'cost-output', type: 'cost-output' }, context)).toBe('Out $2.00');
    });

    it('renders nothing when cost data is missing', () => {
        expect(render({ id: 'cost-output', type: 'cost-output' }, {})).toBeNull();
    });

    it('formats the preview sample', () => {
        expect(render({ id: 'cost-output', type: 'cost-output' }, { isPreview: true })).toBe('Out $0.87');
    });

    it('declares the zero hideable state', () => {
        expect(new CostOutputWidget().getHideableStates().map(state => state.key)).toEqual(['zero']);
    });

    it('hides $0.00 only when the zero hide state is enabled', () => {
        const context = contextWith(0, { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0 });

        expect(render({ id: 'cost-output', type: 'cost-output' }, context)).toBe('Out $0.00');
        expect(render({
            id: 'cost-output',
            type: 'cost-output',
            metadata: { hide: 'zero' }
        }, context)).toBeNull();
    });
});
