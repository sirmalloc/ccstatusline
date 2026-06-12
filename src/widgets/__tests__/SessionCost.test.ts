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
import { SessionCostWidget } from '../SessionCost';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    const widget = new SessionCostWidget();
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionCostWidget', () => {
    it('renders the session cost from status JSON', () => {
        expect(render(
            { id: 'session-cost', type: 'session-cost' },
            { data: { cost: { total_cost_usd: 2.456 } } }
        )).toBe('Cost: $2.46');
    });

    it('renders nothing when cost data is missing', () => {
        expect(render({ id: 'session-cost', type: 'session-cost' }, {})).toBeNull();
    });

    it('declares the zero hideable state', () => {
        expect(new SessionCostWidget().getHideableStates().map(state => state.key)).toEqual(['zero']);
    });

    it('hides $0.00 only when the zero hide state is enabled', () => {
        const context: RenderContext = { data: { cost: { total_cost_usd: 0 } } };

        expect(render({ id: 'session-cost', type: 'session-cost' }, context)).toBe('Cost: $0.00');
        expect(render({
            id: 'session-cost',
            type: 'session-cost',
            metadata: { hide: 'zero' }
        }, context)).toBeNull();
        expect(render({
            id: 'session-cost',
            type: 'session-cost',
            metadata: { hide: 'zero' }
        }, { data: { cost: { total_cost_usd: 0.01 } } })).toBe('Cost: $0.01');
    });

    it('treats sub-cent costs that display as $0.00 as zero', () => {
        expect(render({
            id: 'session-cost',
            type: 'session-cost',
            metadata: { hide: 'zero' }
        }, { data: { cost: { total_cost_usd: 0.001 } } })).toBeNull();
    });
});
