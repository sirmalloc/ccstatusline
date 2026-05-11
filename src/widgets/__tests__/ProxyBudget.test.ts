import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type { ProxyBudgetData } from '../../utils/proxy-budget-fetch';
import { ProxyBudgetWidget } from '../ProxyBudget';

const originalChalkLevel = chalk.level;

function widget(): ProxyBudgetWidget {
    return new ProxyBudgetWidget();
}

function item(overrides: Partial<WidgetItem> = {}): WidgetItem {
    return {
        id: 'pb',
        type: 'proxy-budget',
        ...overrides
    };
}

function ctx(data: ProxyBudgetData | null, isPreview = false): RenderContext {
    return {
        proxyBudgetData: data,
        isPreview
    };
}

function render(w: ProxyBudgetWidget, it: WidgetItem, c: RenderContext): string | null {
    return w.render(it, c, DEFAULT_SETTINGS);
}

describe('ProxyBudgetWidget', () => {
    beforeEach(() => {
        // Force chalk to emit ANSI so tier assertions can inspect SGR codes.
        chalk.level = 1;
    });

    afterEach(() => {
        chalk.level = originalChalkLevel;
    });

    it('returns null when context.proxyBudgetData is null', () => {
        expect(render(widget(), item(), ctx(null))).toBeNull();
    });

    it('renders spend/cap/percentage in green below the warning threshold (default 80)', () => {
        const out = render(widget(), item(), ctx({ spend: 5, budget: 100, percentage: 5, resetAt: null }));
        expect(out).not.toBeNull();
        expect(out).toContain('$5.00');
        expect(out).toContain('$100.00');
        expect(out).toContain('(5%)');
        expect(out).toBe(chalk.green('Budget: $5.00/$100.00 (5%)'));
    });

    it('uses yellow at the warning threshold', () => {
        const out = render(widget(), item(), ctx({ spend: 80, budget: 100, percentage: 80, resetAt: null }));
        expect(out).toBe(chalk.yellow('Budget: $80.00/$100.00 (80%)'));
    });

    it('uses red at the critical threshold', () => {
        const out = render(widget(), item(), ctx({ spend: 96, budget: 100, percentage: 96, resetAt: null }));
        expect(out).toBe(chalk.red('Budget: $96.00/$100.00 (96%)'));
    });

    it('respects custom warningThreshold and criticalThreshold from metadata', () => {
        const customItem = item({ metadata: { warningThreshold: '50', criticalThreshold: '75' } });
        const yellow = render(widget(), customItem, ctx({ spend: 55, budget: 100, percentage: 55, resetAt: null }));
        const red = render(widget(), customItem, ctx({ spend: 80, budget: 100, percentage: 80, resetAt: null }));
        expect(yellow).toBe(chalk.yellow('Budget: $55.00/$100.00 (55%)'));
        expect(red).toBe(chalk.red('Budget: $80.00/$100.00 (80%)'));
    });

    it('renders format=percent (no $ amounts)', () => {
        const out = render(widget(), item({ metadata: { format: 'percent' } }), ctx({ spend: 25, budget: 100, percentage: 25, resetAt: null }));
        expect(out).toBe(chalk.green('Budget: 25%'));
    });

    it('renders format=spend (no percentage)', () => {
        const out = render(widget(), item({ metadata: { format: 'spend' } }), ctx({ spend: 25, budget: 100, percentage: 25, resetAt: null }));
        expect(out).toBe(chalk.green('Budget: $25.00'));
    });

    it('honors item.rawValue by stripping the "Budget:" label', () => {
        const out = render(widget(), item({ rawValue: true }), ctx({ spend: 5, budget: 100, percentage: 5, resetAt: null }));
        expect(out).toBe(chalk.green('$5.00/$100.00 (5%)'));
    });

    it('returns a hardcoded preview when context.isPreview is true', () => {
        const out = render(widget(), item(), ctx(null, true));
        expect(out).toContain('$12.34');
        expect(out).toContain('(45%)');
        expect(out).toContain('Budget:');
    });

    it('preview honors item.rawValue', () => {
        const out = render(widget(), item({ rawValue: true }), ctx(null, true));
        expect(out).not.toContain('Budget:');
        expect(out).toContain('$12.34');
    });

    it('invalid format metadata falls back to spend-percent', () => {
        const out = render(widget(), item({ metadata: { format: 'nonsense' } }), ctx({ spend: 5, budget: 100, percentage: 5, resetAt: null }));
        expect(out).toBe(chalk.green('Budget: $5.00/$100.00 (5%)'));
    });

    it('out-of-range thresholds fall back to defaults', () => {
        const customItem = item({ metadata: { warningThreshold: '999', criticalThreshold: '-5' } });
        const out = render(widget(), customItem, ctx({ spend: 50, budget: 100, percentage: 50, resetAt: null }));
        expect(out).toBe(chalk.green('Budget: $50.00/$100.00 (50%)'));
    });

    it('getEditorDisplay shows preset name in modifier when set', () => {
        const display = widget().getEditorDisplay(item({ metadata: { preset: 'openrouter' } }));
        expect(display.displayText).toBe('Proxy Budget');
        expect(display.modifierText).toBe('(openrouter)');
    });

    it('getNumericValue returns the percentage', () => {
        const value = widget().getNumericValue(ctx({ spend: 30, budget: 100, percentage: 30, resetAt: null }), item());
        expect(value).toBe(30);
    });

    it('getNumericValue returns null when no data', () => {
        const value = widget().getNumericValue(ctx(null), item());
        expect(value).toBeNull();
    });

    it('supportsRawValue and supportsColors are both true', () => {
        const w = widget();
        expect(w.supportsRawValue()).toBe(true);
        expect(w.supportsColors()).toBe(true);
    });
});
