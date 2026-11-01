import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { SpendLimitAmountWidget } from '../SpendLimitAmount';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new SpendLimitAmountWidget().render(item, context, DEFAULT_SETTINGS);
}

const baseItem: WidgetItem = { id: 'spend', type: 'spend-limit-amount' };
const amountContext: RenderContext = { usageData: { spendLimitUsage: 62.8, spendLimitUsedUsd: 314.12, spendLimitLimitUsd: 500 } };

describe('SpendLimitAmountWidget', () => {
    it('describes itself', () => {
        const widget = new SpendLimitAmountWidget();

        expect(widget.getDisplayName()).toBe('Spend Limit Amount');
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getLabelPrefix()).toBe('Spend: ');
        expect(widget.supportsRawValue()).toBe(true);
    });

    it('renders spent and limit in dollars', () => {
        expect(render(baseItem, amountContext)).toBe('Spend: $314.12 / $500.00');
        expect(render({ ...baseItem, rawValue: true }, amountContext)).toBe('$314.12 / $500.00');
    });

    it('applies the number format', () => {
        expect(render({ ...baseItem, numberFormat: { style: 'whole' } }, amountContext)).toBe('Spend: $314 / $500');
    });

    it('renders an exceeded limit', () => {
        const context: RenderContext = { usageData: { spendLimitUsedUsd: 540.5, spendLimitLimitUsd: 500 } };

        expect(render(baseItem, context)).toBe('Spend: $540.50 / $500.00');
    });

    it('renders nothing when the dollar fields are missing', () => {
        expect(render(baseItem, {})).toBeNull();
        expect(render(baseItem, { usageData: { spendLimitUsage: 62.8 } })).toBeNull();
        expect(render(baseItem, { usageData: { spendLimitUsedUsd: 314.12 } })).toBeNull();
        expect(render(baseItem, { usageData: { spendLimitLimitUsd: 500 } })).toBeNull();
    });

    it('ignores usage API errors', () => {
        expect(render(baseItem, { usageData: { error: 'timeout' } })).toBeNull();
    });

    it('renders a preview', () => {
        expect(render(baseItem, { isPreview: true })).toBe('Spend: $314.12 / $500.00');
    });
});
