import chalk from 'chalk';
import {
    beforeAll,
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

// Force enable colors in test environment to verify color application
beforeAll(() => {
    chalk.level = 3; // Enable truecolor support
});

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
        heatGaugeColors: false,
        metadata: inverse ? { inverse: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
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

    describe('Heat gauge colors', () => {
        it('should apply colors when heatGaugeColors is true (default)', () => {
            const widget = new ContextPercentageUsableWidget();
            const context: RenderContext = {
                data: { model: { id: 'claude-3-5-sonnet-20241022' } },
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 10000
                }
            };
            const item: WidgetItem = {
                id: 'context-percentage-usable',
                type: 'context-percentage-usable'
            };
            const result = widget.render(item, context, DEFAULT_SETTINGS);
            expect(result).toContain('6.3%');
            expect(result).toMatch(/\x1b\[/); // ANSI escape sequence present
        });

        it('should not apply colors when heatGaugeColors is false', () => {
            const widget = new ContextPercentageUsableWidget();
            const context: RenderContext = {
                data: { model: { id: 'claude-3-5-sonnet-20241022' } },
                tokenMetrics: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    contextLength: 10000
                }
            };
            const item: WidgetItem = {
                id: 'context-percentage-usable',
                type: 'context-percentage-usable',
                heatGaugeColors: false
            };
            const result = widget.render(item, context, DEFAULT_SETTINGS);
            expect(result).toBe('Ctx(u): 6.3%');
        });
    });
});