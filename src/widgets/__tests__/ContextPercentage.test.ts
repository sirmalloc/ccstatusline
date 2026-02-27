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
import { ContextPercentageWidget } from '../ContextPercentage';

function render(modelId: string | undefined, contextLength: number, rawValue = false, inverse = false) {
    const widget = new ContextPercentageWidget();
    const context: RenderContext = {
        data: modelId ? { model: { id: modelId } } : undefined,
        tokenMetrics: {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength
        }
    };
    const item: WidgetItem = {
        id: 'context-percentage',
        type: 'context-percentage',
        rawValue,
        metadata: inverse ? { inverse: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

function getEffectiveColor(contextLength: number, metadata?: Record<string, string>) {
    const widget = new ContextPercentageWidget();
    const context: RenderContext = {
        data: { model: { id: 'claude-3-5-sonnet-20241022' } },
        tokenMetrics: {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength
        }
    };
    const item: WidgetItem = {
        id: 'context-percentage',
        type: 'context-percentage',
        metadata
    };
    return widget.getEffectiveColor(item, context, DEFAULT_SETTINGS);
}

describe('ContextPercentageWidget', () => {
    describe('Sonnet 4.5 with 1M context window', () => {
        it('should calculate percentage using 1M denominator for Sonnet 4.5 with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000);
            expect(result).toBe('Ctx: 4.2%');
        });

        it('should calculate percentage using 1M denominator for Sonnet 4.5 (raw value) with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000, true);
            expect(result).toBe('4.2%');
        });
    });

    describe('Older models with 200k context window', () => {
        it('should calculate percentage using 200k denominator for older Sonnet 3.5', () => {
            const result = render('claude-3-5-sonnet-20241022', 42000);
            expect(result).toBe('Ctx: 21.0%');
        });

        it('should calculate percentage using 200k denominator when model ID is undefined', () => {
            const result = render(undefined, 42000);
            expect(result).toBe('Ctx: 21.0%');
        });

        it('should calculate percentage using 200k denominator for unknown model', () => {
            const result = render('claude-unknown-model', 42000);
            expect(result).toBe('Ctx: 21.0%');
        });
    });

    describe('getEffectiveColor with thresholds', () => {
        // 200k max tokens, so 100k = 50%, 150k = 75%
        it('should return undefined below warning threshold', () => {
            expect(getEffectiveColor(90000)).toBeUndefined(); // 45%
        });

        it('should return yellow at warning threshold (50%)', () => {
            expect(getEffectiveColor(100000)).toBe('yellow'); // 50%
        });

        it('should return yellow between warning and critical', () => {
            expect(getEffectiveColor(120000)).toBe('yellow'); // 60%
        });

        it('should return red at critical threshold (75%)', () => {
            expect(getEffectiveColor(150000)).toBe('red'); // 75%
        });

        it('should return red above critical', () => {
            expect(getEffectiveColor(180000)).toBe('red'); // 90%
        });

        it('should return undefined when thresholds are off', () => {
            expect(getEffectiveColor(150000, { colorThresholds: 'false' })).toBeUndefined();
        });

        it('should return undefined in preview mode', () => {
            const widget = new ContextPercentageWidget();
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'test', type: 'context-percentage' };
            expect(widget.getEffectiveColor(item, context, DEFAULT_SETTINGS)).toBeUndefined();
        });

        it('should return undefined when no token metrics', () => {
            const widget = new ContextPercentageWidget();
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'test', type: 'context-percentage' };
            expect(widget.getEffectiveColor(item, context, DEFAULT_SETTINGS)).toBeUndefined();
        });

        it('should use usage percentage regardless of inverse display mode', () => {
            // Even with inverse mode, thresholds are based on usage (how full)
            expect(getEffectiveColor(150000, { inverse: 'true' })).toBe('red');
        });
    });

    describe('handleEditorAction for cycle-thresholds', () => {
        const widget = new ContextPercentageWidget();

        it('should cycle from default to conservative', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage' };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.thresholdPreset).toBe('conservative');
        });

        it('should cycle from conservative to aggressive', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { thresholdPreset: 'conservative' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.thresholdPreset).toBe('aggressive');
        });

        it('should cycle from aggressive to off', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { thresholdPreset: 'aggressive' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.colorThresholds).toBe('false');
            expect(result?.metadata?.thresholdPreset).toBeUndefined();
        });

        it('should cycle from off back to default', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { colorThresholds: 'false' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.thresholdPreset).toBe('default');
            expect(result?.metadata?.colorThresholds).toBeUndefined();
        });

        it('should preserve other metadata when cycling', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { inverse: 'true' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.inverse).toBe('true');
            expect(result?.metadata?.thresholdPreset).toBe('conservative');
        });
    });

    describe('getEditorDisplay with thresholds', () => {
        const widget = new ContextPercentageWidget();

        it('should show default threshold label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage' };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(thresholds: 50/75%)');
        });

        it('should show conservative threshold label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { thresholdPreset: 'conservative' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(thresholds: 30/60%)');
        });

        it('should show off label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { colorThresholds: 'false' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(thresholds: off)');
        });

        it('should show both remaining and threshold label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage', metadata: { inverse: 'true' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(remaining, thresholds: 50/75%)');
        });
    });

    describe('getCustomKeybinds', () => {
        it('should include threshold keybind', () => {
            const widget = new ContextPercentageWidget();
            const keybinds = widget.getCustomKeybinds();
            const thresholdKeybind = keybinds.find(kb => kb.action === 'cycle-thresholds');
            expect(thresholdKeybind).toBeDefined();
            expect(thresholdKeybind?.key).toBe('t');
        });
    });
});