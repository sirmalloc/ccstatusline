import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as jsonl from '../../utils/jsonl';
import { SessionBudgetWidget } from '../SessionBudget';

const baseItem: WidgetItem = { id: 'test', type: 'session-budget' };
const rawItem: WidgetItem = { ...baseItem, rawValue: true };

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new SessionBudgetWidget().render(item, context, DEFAULT_SETTINGS);
}

describe('SessionBudgetWidget', () => {
    beforeEach(() => {
        // Prevent cached block metrics from interfering
        vi.spyOn(jsonl, 'getCachedBlockMetrics').mockReturnValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns preview text', () => {
        expect(render(baseItem, { isPreview: true })).toBe('5h: 32% \u219334%');
    });

    it('returns null when no usage data', () => {
        expect(render(baseItem, {})).toBeNull();
    });

    it('returns error message on usage error', () => {
        expect(render(baseItem, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    it('shows usage without indicator when no reset time', () => {
        expect(render(baseItem, { usageData: { sessionUsage: 45 } })).toBe('5h: 45%');
    });

    it('shows usage with down arrow when under budget', () => {
        const now = Date.now();
        const resetAt = new Date(now + 2 * 60 * 60 * 1000).toISOString(); // 2h remaining = 3h elapsed = 60%
        const result = render(baseItem, { usageData: { sessionUsage: 20, sessionResetAt: resetAt } });
        // 60% expected, 20% actual → ↓40%
        expect(result).toBe('5h: 20% \u219340%');
    });

    it('shows usage with up arrow when over budget', () => {
        const now = Date.now();
        const resetAt = new Date(now + 4 * 60 * 60 * 1000).toISOString(); // 4h remaining = 1h elapsed = 20%
        const result = render(baseItem, { usageData: { sessionUsage: 60, sessionResetAt: resetAt } });
        // 20% expected, 60% actual → ↑40%
        expect(result).toBe('5h: 60% \u219140%');
    });

    it('supports raw value (no label)', () => {
        const result = render(rawItem, { usageData: { sessionUsage: 30 } });
        expect(result).toBe('30%');
    });

    it('clamps usage to 0-100', () => {
        expect(render(baseItem, { usageData: { sessionUsage: 150 } })).toBe('5h: 100%');
        expect(render(baseItem, { usageData: { sessionUsage: -10 } })).toBe('5h: 0%');
    });
});