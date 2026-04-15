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
import { ContextLengthWidget } from '../ContextLength';

describe('ContextLengthWidget', () => {
    it('renders context length from context_window data', () => {
        const widget = new ContextLengthWidget();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 15000,
                        output_tokens: 3600,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

        const result = widget.render(item, context, DEFAULT_SETTINGS);
        expect(result).toContain('Ctx:');
        expect(result).toContain('15.0k');
    });

    it('falls back to tokenMetrics when context_window data is missing', () => {
        const widget = new ContextLengthWidget();
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 42000
            }
        };
        const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

        const result = widget.render(item, context, DEFAULT_SETTINGS);
        expect(result).toContain('Ctx:');
        expect(result).toContain('42.0k');
    });

    it('renders raw value without label', () => {
        const widget = new ContextLengthWidget();
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 42000
            }
        };
        const item: WidgetItem = { id: 'ctx-len', type: 'context-length', rawValue: true };

        const result = widget.render(item, context, DEFAULT_SETTINGS);
        expect(result).not.toContain('Ctx:');
        expect(result).toContain('42.0k');
    });

    it('renders preview value', () => {
        const widget = new ContextLengthWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx: 18.6k');
    });

    it('renders preview raw value', () => {
        const widget = new ContextLengthWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'ctx-len', type: 'context-length', rawValue: true };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('18.6k');
    });

    describe('getValue', () => {
        it('returns number value type', () => {
            const widget = new ContextLengthWidget();
            expect(widget.getValueType()).toBe('number');
        });

        it('returns numeric value from context_window data', () => {
            const widget = new ContextLengthWidget();
            const context: RenderContext = {
                data: {
                    context_window: {
                        current_usage: {
                            input_tokens: 15000,
                            output_tokens: 3600,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0
                        }
                    }
                }
            };
            const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

            expect(widget.getValue(context, item)).toBe(15000);
        });

        it('returns numeric value from tokenMetrics fallback', () => {
            const widget = new ContextLengthWidget();
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 42000
                }
            };
            const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

            expect(widget.getValue(context, item)).toBe(42000);
        });

        it('returns numeric value in preview mode', () => {
            const widget = new ContextLengthWidget();
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

            expect(widget.getValue(context, item)).toBe(18600);
        });

        it('returns null when data is missing', () => {
            const widget = new ContextLengthWidget();
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'ctx-len', type: 'context-length' };

            expect(widget.getValue(context, item)).toBe(null);
        });
    });
});