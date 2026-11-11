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
import { CostInputWidget } from '../CostInput';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    const widget = new CostInputWidget();
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

describe('CostInputWidget', () => {
    it('scales the input-cost estimate to match the real session total', () => {
        // Raw estimate sums to $2, but Claude Code's own total is $4 -- the
        // widget must report input's *share* ($1) of the real total, not the
        // unscaled estimate ($0.50).
        const context = contextWith(4, { inputCost: 0.5, outputCost: 1, cacheWriteCost: 0.3, cacheReadCost: 0.2 });
        expect(render({ id: 'cost-input', type: 'cost-input' }, context)).toBe('In $1.00');
    });

    it('renders nothing when cost data is missing', () => {
        expect(render({ id: 'cost-input', type: 'cost-input' }, {})).toBeNull();
    });

    it('renders nothing when total cost is present but token metrics are not', () => {
        expect(render(
            { id: 'cost-input', type: 'cost-input' },
            { data: { cost: { total_cost_usd: 1.5 } } }
        )).toBeNull();
    });

    it('formats the preview sample', () => {
        expect(render({ id: 'cost-input', type: 'cost-input' }, { isPreview: true })).toBe('In $0.18');
    });

    it('declares the zero hideable state', () => {
        expect(new CostInputWidget().getHideableStates().map(state => state.key)).toEqual(['zero']);
    });

    it('hides $0.00 only when the zero hide state is enabled', () => {
        const context = contextWith(0, { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0 });

        expect(render({ id: 'cost-input', type: 'cost-input' }, context)).toBe('In $0.00');
        expect(render({
            id: 'cost-input',
            type: 'cost-input',
            metadata: { hide: 'zero' }
        }, context)).toBeNull();
    });
});
