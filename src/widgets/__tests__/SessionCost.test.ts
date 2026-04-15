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

function createItem(
    type: string,
    options: {
        rawValue?: boolean;
        character?: string;
    } = {}
): WidgetItem {
    return {
        id: type,
        type,
        rawValue: options.rawValue,
        character: options.character
    };
}

describe('SessionCostWidget', () => {
    const widget = new SessionCostWidget();

    it('should report Session category', () => {
        expect(widget.getCategory()).toBe('Session');
    });

    it('should render preview value', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('session-cost'), context, DEFAULT_SETTINGS)).toBe('Cost: $2.45');
        expect(widget.render(createItem('session-cost', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('$2.45');
    });

    it('should render actual cost when available', () => {
        const context: RenderContext = {
            data: {
                cost: { total_cost_usd: 3.75 }
            }
        };
        expect(widget.render(createItem('session-cost'), context, DEFAULT_SETTINGS)).toBe('Cost: $3.75');
        expect(widget.render(createItem('session-cost', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('$3.75');
    });

    it('should return null when cost data is missing', () => {
        const context: RenderContext = {};
        expect(widget.render(createItem('session-cost'), context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('should return null when cost data is undefined', () => {
        const context: RenderContext = {
            data: { cost: { total_cost_usd: undefined } }
        };
        expect(widget.render(createItem('session-cost'), context, DEFAULT_SETTINGS)).toBeNull();
    });

    describe('getValue', () => {
        it('should declare number value type', () => {
            expect(widget.getValueType()).toBe('number');
        });

        it('should extract numeric value from preview mode', () => {
            const context: RenderContext = { isPreview: true };
            expect(widget.getValue(context, createItem('session-cost'))).toBe(2.45);
        });

        it('should extract numeric value from live data', () => {
            const context: RenderContext = {
                data: {
                    cost: { total_cost_usd: 12.99 }
                }
            };
            expect(widget.getValue(context, createItem('session-cost'))).toBe(12.99);
        });

        it('should return null when cost data is missing', () => {
            const context: RenderContext = {};
            expect(widget.getValue(context, createItem('session-cost'))).toBeNull();
        });

        it('should parse currency symbol correctly', () => {
            const context: RenderContext = {
                data: {
                    cost: { total_cost_usd: 0.50 }
                }
            };
            expect(widget.getValue(context, createItem('session-cost'))).toBe(0.50);
        });
    });
});
