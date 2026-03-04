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

describe('ContextPercentageWidget', () => {
    it('toggles inverse metadata and editor modifier', () => {
        const widget = new ContextPercentageWidget();
        const base: WidgetItem = {
            id: 'context-percentage',
            type: 'context-percentage'
        };

        const inverted = widget.handleEditorAction('toggle-inverse', base);
        const cleared = widget.handleEditorAction('toggle-inverse', inverted ?? base);

        expect(inverted?.metadata?.inverse).toBe('true');
        expect(cleared?.metadata?.inverse).toBe('false');
        expect(widget.getEditorDisplay(base).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay({
            ...base,
            metadata: { inverse: 'true' }
        }).modifierText).toBe('(remaining)');
    });

    it('prefers context_window percentage over token metrics when both exist', () => {
        const widget = new ContextPercentageWidget();
        const item: WidgetItem = {
            id: 'context-percentage',
            type: 'context-percentage'
        };
        const context: RenderContext = {
            data: {
                model: { id: 'claude-3-5-sonnet-20241022' },
                context_window: {
                    context_window_size: 200000,
                    used_percentage: 9.3
                }
            },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 100000
            }
        };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx: 9.3%');
    });

    describe('Sonnet 4.5 with 1M context window', () => {
        it('should calculate percentage using 1M denominator for Sonnet 4.5 with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000);
            expect(result).toBe('Ctx: 4.2%');
        });

        it('should calculate percentage using 1M denominator for Sonnet 4.5 (raw value) with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000, true);
            expect(result).toBe('4.2%');
        });

        it('should calculate percentage using 1M denominator for 1M context label model IDs', () => {
            const result = render('Opus 4.6 (1M context)', 42000);
            expect(result).toBe('Ctx: 4.2%');
        });

        it('should calculate percentage using 1M denominator for 1M in parentheses model IDs', () => {
            const result = render('Opus 4.6 (1M)', 42000);
            expect(result).toBe('Ctx: 4.2%');
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
});