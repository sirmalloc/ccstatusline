import {
    describe,
    expect,
    it
} from 'vitest';

import { getHeatGaugeColor } from '../colors';

describe('getHeatGaugeColor', () => {
    describe('Default thresholds', () => {
        it('should return cool cyan for low usage (< 30%)', () => {
            const color = getHeatGaugeColor(10);
            expect(color).toBe('hex:00D9FF'); // Cyan - cool
        });

        it('should return green for comfortable range (30-40%)', () => {
            const color = getHeatGaugeColor(35);
            expect(color).toBe('hex:4ADE80'); // Green - comfortable
        });

        it('should return yellow at pretty hot threshold (40%)', () => {
            const color = getHeatGaugeColor(40);
            expect(color).toBe('hex:FDE047'); // Yellow - pretty hot
        });

        it('should return yellow in pretty hot range (40-55%)', () => {
            const color = getHeatGaugeColor(50);
            expect(color).toBe('hex:FDE047'); // Yellow - pretty hot
        });

        it('should return orange at very hot threshold (55%)', () => {
            const color = getHeatGaugeColor(55);
            expect(color).toBe('hex:FB923C'); // Orange - very hot
        });

        it('should return orange in very hot range (55-70%)', () => {
            const color = getHeatGaugeColor(65);
            expect(color).toBe('hex:FB923C'); // Orange - very hot
        });

        it('should return red for high usage (70%+)', () => {
            const color = getHeatGaugeColor(70);
            expect(color).toBe('hex:F87171'); // Red - critical
        });
    });

    describe('Custom thresholds', () => {
        it('should use custom thresholds when provided', () => {
            // With custom cool=20, 25% should be green (above cool)
            // Default would return cyan (25 < default cool=30)
            const color = getHeatGaugeColor(25, { cool: 20, warm: 35, hot: 50, veryHot: 65 });
            expect(color).toBe('hex:4ADE80'); // Green
        });

        it('should fall back to defaults when no custom thresholds provided', () => {
            // 25% with defaults = cyan (< 30%)
            const color = getHeatGaugeColor(25);
            expect(color).toBe('hex:00D9FF'); // Cyan
        });

        it('should apply custom hot threshold correctly', () => {
            const color = getHeatGaugeColor(45, { cool: 20, warm: 35, hot: 50, veryHot: 65 });
            expect(color).toBe('hex:FDE047'); // Yellow — 45 is between warm=35 and hot=50
        });

        it('should apply custom veryHot threshold correctly', () => {
            const color = getHeatGaugeColor(60, { cool: 20, warm: 35, hot: 50, veryHot: 65 });
            expect(color).toBe('hex:FB923C'); // Orange — 60 is between hot=50 and veryHot=65
        });

        it('should apply custom critical threshold correctly', () => {
            const color = getHeatGaugeColor(70, { cool: 20, warm: 35, hot: 50, veryHot: 65 });
            expect(color).toBe('hex:F87171'); // Red — 70 >= veryHot=65
        });
    });
});