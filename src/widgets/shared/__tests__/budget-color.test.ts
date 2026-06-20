import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../../types/RenderContext';
import type { WidgetItem } from '../../../types/Widget';
import { ExtraUsageRemainingWidget } from '../../ExtraUsageRemaining';
import { ExtraUsageUsedWidget } from '../../ExtraUsageUsed';
import { ExtraUsageUtilizationWidget } from '../../ExtraUsageUtilization';
import {
    appendBudgetColorsModifier,
    getBudgetColorsKeybind,
    handleToggleBudgetColorsAction,
    isBudgetColorsEnabled,
    resolveBudgetColor
} from '../budget-color';

const item = (metadata: Record<string, string> = {}): WidgetItem => ({ id: 'x', type: 'extra-usage-used', metadata });
const on = (extra: Record<string, string> = {}): WidgetItem => item({ budgetColors: 'true', ...extra });
const ctx = (utilization?: number): RenderContext => ({ usageData: { extraUsageUtilization: utilization } });

describe('budget-color', () => {
    it('returns undefined when the opt-in flag is off', () => {
        expect(isBudgetColorsEnabled(item())).toBe(false);
        expect(resolveBudgetColor(item(), 95)).toBeUndefined();
    });

    it('returns undefined when utilization is unknown', () => {
        expect(resolveBudgetColor(on(), undefined)).toBeUndefined();
    });

    it('escalates green -> yellow -> red across the thresholds', () => {
        expect(resolveBudgetColor(on(), 0)).toBe('green');
        expect(resolveBudgetColor(on(), 74)).toBe('green');
        expect(resolveBudgetColor(on(), 75)).toBe('yellow');
        expect(resolveBudgetColor(on(), 89)).toBe('yellow');
        expect(resolveBudgetColor(on(), 90)).toBe('red');
        expect(resolveBudgetColor(on(), 100)).toBe('red');
    });

    it('honors per-tier color overrides', () => {
        const colors = { budgetColorOk: 'hex:00FF00', budgetColorWarn: 'hex:FFAA00', budgetColorCrit: 'hex:FF0000' };
        expect(resolveBudgetColor(on(colors), 10)).toBe('hex:00FF00');
        expect(resolveBudgetColor(on(colors), 80)).toBe('hex:FFAA00');
        expect(resolveBudgetColor(on(colors), 99)).toBe('hex:FF0000');
    });

    it('toggles the opt-in flag via the editor action', () => {
        const enabled = handleToggleBudgetColorsAction('toggle-budget-colors', item());
        expect(enabled?.metadata?.budgetColors).toBe('true');
        expect(handleToggleBudgetColorsAction('toggle-budget-colors', enabled ?? item())?.metadata?.budgetColors).toBe('false');
        expect(handleToggleBudgetColorsAction('something-else', item())).toBeNull();
    });

    it('exposes a (b)udget colors keybind', () => {
        expect(getBudgetColorsKeybind()).toEqual({ key: 'b', label: '(b)udget colors', action: 'toggle-budget-colors' });
    });

    it('appends the modifier only when enabled', () => {
        expect(appendBudgetColorsModifier(undefined, item())).toBeUndefined();
        expect(appendBudgetColorsModifier(undefined, on())).toBe('(budget colors)');
        expect(appendBudgetColorsModifier('(short bar)', on())).toBe('(short bar, budget colors)');
    });

    it('each Extra Usage widget colors by utilization through getDynamicColor', () => {
        const widgets = [new ExtraUsageUsedWidget(), new ExtraUsageRemainingWidget(), new ExtraUsageUtilizationWidget()];
        for (const widget of widgets) {
            expect(widget.getDynamicColor(item(), ctx(95))).toBeUndefined();
            expect(widget.getDynamicColor(on(), ctx(50))).toBe('green');
            expect(widget.getDynamicColor(on(), ctx(95))).toBe('red');
            expect(widget.getDynamicColor(on(), ctx(undefined))).toBeUndefined();
        }
    });
});
