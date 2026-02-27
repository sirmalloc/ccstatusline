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
import { ContextPercentageUsableWidget } from '../ContextPercentageUsable';

function render(modelId: string | undefined, contextLength: number, rawValue = false, inverse = false) {
    const widget = new ContextPercentageUsableWidget();
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
        id: 'context-percentage-usable',
        type: 'context-percentage-usable',
        rawValue,
        metadata: inverse ? { inverse: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

function getEffectiveColor(contextLength: number, metadata?: Record<string, string>) {
    const widget = new ContextPercentageUsableWidget();
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
        id: 'context-percentage-usable',
        type: 'context-percentage-usable',
        metadata
    };
    return widget.getEffectiveColor(item, context, DEFAULT_SETTINGS);
}

describe('ContextPercentageUsableWidget', () => {
    describe('Sonnet 4.5 with 800k usable tokens', () => {
        it('should calculate percentage using 800k denominator for Sonnet 4.5 with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000);
            expect(result).toBe('Ctx(u): 5.3%');
        });

        it('should calculate percentage using 800k denominator for Sonnet 4.5 (raw value) with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000, true);
            expect(result).toBe('5.3%');
        });
    });

    describe('Older models with 160k usable tokens', () => {
        it('should calculate percentage using 160k denominator for older Sonnet 3.5', () => {
            const result = render('claude-3-5-sonnet-20241022', 42000);
            expect(result).toBe('Ctx(u): 26.3%');
        });

        it('should calculate percentage using 160k denominator when model ID is undefined', () => {
            const result = render(undefined, 42000);
            expect(result).toBe('Ctx(u): 26.3%');
        });

        it('should calculate percentage using 160k denominator for unknown model', () => {
            const result = render('claude-unknown-model', 42000);
            expect(result).toBe('Ctx(u): 26.3%');
        });
    });

    describe('getEffectiveColor with thresholds', () => {
        // 160k usable tokens, so 80k = 50%, 120k = 75%
        it('should return undefined below warning threshold', () => {
            expect(getEffectiveColor(72000)).toBeUndefined(); // 45%
        });

        it('should return yellow at warning threshold (50%)', () => {
            expect(getEffectiveColor(80000)).toBe('yellow'); // 50%
        });

        it('should return yellow between warning and critical', () => {
            expect(getEffectiveColor(100000)).toBe('yellow'); // 62.5%
        });

        it('should return red at critical threshold (75%)', () => {
            expect(getEffectiveColor(120000)).toBe('red'); // 75%
        });

        it('should return red above critical', () => {
            expect(getEffectiveColor(150000)).toBe('red'); // 93.75%
        });

        it('should return undefined when thresholds are off', () => {
            expect(getEffectiveColor(120000, { colorThresholds: 'false' })).toBeUndefined();
        });

        it('should return undefined in preview mode', () => {
            const widget = new ContextPercentageUsableWidget();
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable' };
            expect(widget.getEffectiveColor(item, context, DEFAULT_SETTINGS)).toBeUndefined();
        });

        it('should return undefined when no token metrics', () => {
            const widget = new ContextPercentageUsableWidget();
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable' };
            expect(widget.getEffectiveColor(item, context, DEFAULT_SETTINGS)).toBeUndefined();
        });

        it('should use usableTokens (160k) not maxTokens (200k) for percentage', () => {
            // 80k / 160k = 50% (yellow with usable), but 80k / 200k = 40% (would be undefined with max)
            expect(getEffectiveColor(80000)).toBe('yellow');
            // 90k / 160k = 56.25% (yellow), but 90k / 200k = 45% (would be undefined with max)
            expect(getEffectiveColor(90000)).toBe('yellow');
        });

        it('should use usage percentage regardless of inverse display mode', () => {
            expect(getEffectiveColor(120000, { inverse: 'true' })).toBe('red');
        });
    });

    describe('handleEditorAction for cycle-thresholds', () => {
        const widget = new ContextPercentageUsableWidget();

        it('should cycle from default to conservative', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable' };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.thresholdPreset).toBe('conservative');
        });

        it('should cycle from conservative to aggressive', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { thresholdPreset: 'conservative' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.thresholdPreset).toBe('aggressive');
        });

        it('should cycle from aggressive to off', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { thresholdPreset: 'aggressive' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.colorThresholds).toBe('false');
            expect(result?.metadata?.thresholdPreset).toBeUndefined();
        });

        it('should cycle from off back to default', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { colorThresholds: 'false' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.thresholdPreset).toBe('default');
            expect(result?.metadata?.colorThresholds).toBeUndefined();
        });

        it('should preserve other metadata when cycling', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { inverse: 'true' } };
            const result = widget.handleEditorAction('cycle-thresholds', item);
            expect(result?.metadata?.inverse).toBe('true');
            expect(result?.metadata?.thresholdPreset).toBe('conservative');
        });
    });

    describe('getEditorDisplay with thresholds', () => {
        const widget = new ContextPercentageUsableWidget();

        it('should show default threshold label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable' };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(thresholds: 50/75%)');
        });

        it('should show conservative threshold label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { thresholdPreset: 'conservative' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(thresholds: 30/60%)');
        });

        it('should show off label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { colorThresholds: 'false' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(thresholds: off)');
        });

        it('should show both remaining and threshold label', () => {
            const item: WidgetItem = { id: 'test', type: 'context-percentage-usable', metadata: { inverse: 'true' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(remaining, thresholds: 50/75%)');
        });
    });

    describe('getCustomKeybinds', () => {
        it('should include threshold keybind', () => {
            const widget = new ContextPercentageUsableWidget();
            const keybinds = widget.getCustomKeybinds();
            const thresholdKeybind = keybinds.find(kb => kb.action === 'cycle-thresholds');
            expect(thresholdKeybind).toBeDefined();
            expect(thresholdKeybind?.key).toBe('t');
        });
    });
});
