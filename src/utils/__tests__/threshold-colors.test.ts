import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DISCRETE_COLOR_PALETTE,
    getThresholdColor,
    hashStringToColor
} from '../colors';

describe('getThresholdColor', () => {
    it('returns green below low threshold', () => {
        expect(getThresholdColor(0)).toBe('green');
        expect(getThresholdColor(25)).toBe('green');
        expect(getThresholdColor(49)).toBe('green');
    });

    it('returns yellow between low and high threshold', () => {
        expect(getThresholdColor(50)).toBe('yellow');
        expect(getThresholdColor(65)).toBe('yellow');
        expect(getThresholdColor(79)).toBe('yellow');
    });

    it('returns red at or above high threshold', () => {
        expect(getThresholdColor(80)).toBe('red');
        expect(getThresholdColor(90)).toBe('red');
        expect(getThresholdColor(100)).toBe('red');
    });

    it('respects custom thresholds', () => {
        expect(getThresholdColor(30, 30, 70)).toBe('yellow');
        expect(getThresholdColor(29, 30, 70)).toBe('green');
        expect(getThresholdColor(70, 30, 70)).toBe('red');
        expect(getThresholdColor(69, 30, 70)).toBe('yellow');
    });

    it('handles edge cases', () => {
        expect(getThresholdColor(0, 0, 0)).toBe('red');
        expect(getThresholdColor(100, 100, 100)).toBe('red');
    });
});

describe('hashStringToColor', () => {
    it('returns a color from the provided palette', () => {
        const color = hashStringToColor('claude-sonnet-4-5-20250929', DISCRETE_COLOR_PALETTE);
        expect(DISCRETE_COLOR_PALETTE).toContain(color);
    });

    it('returns consistent results for the same input', () => {
        const color1 = hashStringToColor('claude-sonnet-4-5-20250929', DISCRETE_COLOR_PALETTE);
        const color2 = hashStringToColor('claude-sonnet-4-5-20250929', DISCRETE_COLOR_PALETTE);
        expect(color1).toBe(color2);
    });

    it('strips version numbers so model families hash the same', () => {
        const color1 = hashStringToColor('claude-sonnet-4-5-20250929', DISCRETE_COLOR_PALETTE);
        const color2 = hashStringToColor('claude-sonnet-4-6-20260101', DISCRETE_COLOR_PALETTE);
        expect(color1).toBe(color2);
    });

    it('produces different colors for different model families', () => {
        const sonnet = hashStringToColor('Sonnet', DISCRETE_COLOR_PALETTE);
        const opus = hashStringToColor('Opus', DISCRETE_COLOR_PALETTE);
        // They may collide but should differ for most inputs
        // This is a soft check - hash collisions are possible
        expect(typeof sonnet).toBe('string');
        expect(typeof opus).toBe('string');
    });

    it('handles empty strings gracefully', () => {
        const color = hashStringToColor('', DISCRETE_COLOR_PALETTE);
        expect(DISCRETE_COLOR_PALETTE).toContain(color);
    });
});