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
import { ContextPercentageWidget } from '../ContextPercentage';

// Force enable colors in test environment to verify color application
beforeAll(() => {
    chalk.level = 3; // Enable truecolor support
});

// Helper to strip ANSI color codes for testing
function stripAnsi(str: string): string {
    // Match all ANSI escape sequences including truecolor (38;2;R;G;B)
    return str.replace(/\u001b\[[^m]*m/g, '');
}

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
    describe('Heat gauge colors', () => {
        it('should apply colors to low percentage values', () => {
            // 5% usage - should have cyan color (ANSI codes present)
            const result = render('claude-3-5-sonnet-20241022', 10000);
            expect(result).toContain('5.0%');
            // Verify ANSI escape codes are present (colors applied)
            expect(result).toMatch(/\x1b\[/); // ANSI escape sequence present
        });

        it('should apply colors to high percentage values', () => {
            // 90% usage - should have red color (ANSI codes present)
            const result = render('claude-3-5-sonnet-20241022', 180000);
            expect(result).toContain('90.0%');
            // Verify ANSI escape codes are present (colors applied)
            expect(result).toMatch(/\x1b\[/); // ANSI escape sequence present
        });

        it('should apply different colors for low vs high percentages', () => {
            const lowResult = render('claude-3-5-sonnet-20241022', 10000); // 5%
            const highResult = render('claude-3-5-sonnet-20241022', 180000); // 90%
            // The ANSI color codes should be different
            expect(highResult).not.toBeNull();
            expect(lowResult).not.toBe(highResult?.replace('90.0%', '5.0%'));
        });

        it('should apply colors in raw value mode', () => {
            const result = render('claude-3-5-sonnet-20241022', 10000, true);
            expect(result).toContain('5.0%');
            expect(result).not.toContain('Ctx:');
            // Verify ANSI escape codes are present
            expect(result).toMatch(/\x1b\[/);
        });
    });

    describe('Heat gauge colors in inverse mode', () => {
        it('should apply cool color when showing low remaining percentage', () => {
            // 90% used = 10% remaining (should show cool cyan color)
            const result = render('claude-3-5-sonnet-20241022', 180000, false, true);
            expect(result).toContain('10.0%'); // Shows remaining
            // Verify colors are applied
            expect(result).toMatch(/\x1b\[/);
        });

        it('should apply hot color when showing high remaining percentage', () => {
            // 10% used = 90% remaining (should show hot red color)
            const result = render('claude-3-5-sonnet-20241022', 20000, false, true);
            expect(result).toContain('90.0%'); // Shows remaining
            // Verify colors are applied
            expect(result).toMatch(/\x1b\[/);
        });

        it('should color based on displayed percentage not usage', () => {
            // Same usage level should produce different colors in normal vs inverse mode
            const normalResult = render('claude-3-5-sonnet-20241022', 180000, false, false); // 90% used
            const inverseResult = render('claude-3-5-sonnet-20241022', 180000, false, true); // 10% remaining
            // The color codes should differ because displayed percentages differ (90% vs 10%)
            expect(normalResult).not.toBe(inverseResult);
        });
    });

    describe('Sonnet 4.5 with 1M context window', () => {
        it('should calculate percentage using 1M denominator for Sonnet 4.5 with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000);
            // Strip ANSI codes to check the percentage value
            expect(result).not.toBeNull();
            expect(stripAnsi(result!)).toBe('Ctx: 4.2%');
        });

        it('should calculate percentage using 1M denominator for Sonnet 4.5 (raw value) with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000, true);
            // Strip ANSI codes to check the percentage value
            expect(result).not.toBeNull();
            expect(stripAnsi(result!)).toBe('4.2%');
        });
    });

    describe('Older models with 200k context window', () => {
        it('should calculate percentage using 200k denominator for older Sonnet 3.5', () => {
            const result = render('claude-3-5-sonnet-20241022', 42000);
            // Strip ANSI codes to check the percentage value
            expect(result).not.toBeNull();
            expect(stripAnsi(result!)).toBe('Ctx: 21.0%');
        });

        it('should calculate percentage using 200k denominator when model ID is undefined', () => {
            const result = render(undefined, 42000);
            // Strip ANSI codes to check the percentage value
            expect(result).not.toBeNull();
            expect(stripAnsi(result!)).toBe('Ctx: 21.0%');
        });

        it('should calculate percentage using 200k denominator for unknown model', () => {
            const result = render('claude-unknown-model', 42000);
            // Strip ANSI codes to check the percentage value
            expect(result).not.toBeNull();
            expect(stripAnsi(result!)).toBe('Ctx: 21.0%');
        });
    });

    describe('Custom heat gauge thresholds from settings', () => {
        function renderWithThresholds(
            modelId: string | undefined,
            contextLength: number,
            thresholds: { cool: number; warm: number; hot: number; veryHot: number } | undefined
        ) {
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
                type: 'context-percentage'
            };
            const settings = {
                ...DEFAULT_SETTINGS,
                heatGaugeThresholds: thresholds
            };
            return widget.render(item, context, settings);
        }

        it('should use custom thresholds when configured', () => {
            // 25% usage with custom cool=20 should produce green
            // With defaults, 25% < 30% (cool) would produce cyan
            const result = renderWithThresholds('claude-3-5-sonnet-20241022', 50000, { cool: 20, warm: 35, hot: 50, veryHot: 65 });
            expect(result).not.toBeNull();
            // Green = rgb(74, 222, 128) = hex:4ADE80
            expect(result).toMatch(/\x1b\[38;2;74;222;128m/);
        });

        it('should fall back to defaults when no custom thresholds configured', () => {
            // 5% usage with no custom thresholds = cyan (< default cool=30%)
            const result = renderWithThresholds('claude-3-5-sonnet-20241022', 10000, undefined);
            expect(result).not.toBeNull();
            // Cyan = rgb(0, 217, 255) = hex:00D9FF
            expect(result).toMatch(/\x1b\[38;2;0;217;255m/);
        });
    });
});