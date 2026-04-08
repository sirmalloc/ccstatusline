import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { WeeklyBudgetWidget } from '../WeeklyBudget';

const baseItem: WidgetItem = { id: 'test', type: 'weekly-budget' };
const rawItem: WidgetItem = { ...baseItem, rawValue: true };

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new WeeklyBudgetWidget().render(item, context, DEFAULT_SETTINGS);
}

describe('WeeklyBudgetWidget', () => {
    it('returns preview text', () => {
        expect(render(baseItem, { isPreview: true })).toBe('Week: 27% \u21939%');
    });

    it('returns null when no usage data', () => {
        expect(render(baseItem, {})).toBeNull();
    });

    it('returns error message on usage error', () => {
        expect(render(baseItem, { usageData: { error: 'api-error' } })).toBe('[API Error]');
    });

    it('shows usage without indicator when no reset time', () => {
        expect(render(baseItem, { usageData: { weeklyUsage: 27 } })).toBe('Week: 27%');
    });

    it('shows usage with down arrow when under budget', () => {
        const now = Date.now();
        // 3.5 days remaining = 3.5 days elapsed = 50% expected
        const resetAt = new Date(now + 3.5 * 24 * 60 * 60 * 1000).toISOString();
        const result = render(baseItem, { usageData: { weeklyUsage: 20, weeklyResetAt: resetAt } });
        // 50% expected, 20% actual → ↓30%
        expect(result).toBe('Week: 20% \u219330%');
    });

    it('shows usage with up arrow when over budget', () => {
        const now = Date.now();
        // 6 days remaining = 1 day elapsed ≈ 14% expected
        const resetAt = new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString();
        const result = render(baseItem, { usageData: { weeklyUsage: 50, weeklyResetAt: resetAt } });
        // ~14% expected, 50% actual → ↑36%
        expect(result).toBe('Week: 50% \u219136%');
    });

    it('supports raw value (no label)', () => {
        const result = render(rawItem, { usageData: { weeklyUsage: 30 } });
        expect(result).toBe('30%');
    });
});