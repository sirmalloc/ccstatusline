import {
    describe,
    expect,
    it
} from 'vitest';

import { SettingsSchema } from '../Settings';

describe('SettingsSchema heatGaugeThresholds', () => {
    it('should accept settings without heatGaugeThresholds', () => {
        const result = SettingsSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('should accept valid heatGaugeThresholds', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: 20, warm: 35, hot: 50, veryHot: 65 } });
        expect(result.success).toBe(true);
    });

    it('should reject thresholds where cool >= warm', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: 40, warm: 35, hot: 50, veryHot: 65 } });
        expect(result.success).toBe(false);
    });

    it('should reject thresholds where warm >= hot', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: 20, warm: 50, hot: 50, veryHot: 65 } });
        expect(result.success).toBe(false);
    });

    it('should reject thresholds where hot >= veryHot', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: 20, warm: 35, hot: 70, veryHot: 65 } });
        expect(result.success).toBe(false);
    });

    it('should reject thresholds below 0', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: -5, warm: 35, hot: 50, veryHot: 65 } });
        expect(result.success).toBe(false);
    });

    it('should reject thresholds above 100', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: 20, warm: 35, hot: 50, veryHot: 105 } });
        expect(result.success).toBe(false);
    });

    it('should reject partial threshold objects (missing fields)', () => {
        const result = SettingsSchema.safeParse({ heatGaugeThresholds: { cool: 20, warm: 35 } });
        expect(result.success).toBe(false);
    });
});