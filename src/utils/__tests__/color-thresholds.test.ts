import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    THRESHOLD_CYCLE_ORDER,
    getCurrentPreset,
    getContextThresholdColor,
    getPresetLabel
} from '../color-thresholds';

function makeItem(metadata?: Record<string, string>): WidgetItem {
    return {
        id: 'test',
        type: 'context-percentage',
        metadata
    };
}

describe('getContextThresholdColor', () => {
    describe('default preset (50/75%)', () => {
        it('should return undefined below warning threshold', () => {
            expect(getContextThresholdColor(makeItem(), 0)).toBeUndefined();
            expect(getContextThresholdColor(makeItem(), 25)).toBeUndefined();
            expect(getContextThresholdColor(makeItem(), 49.9)).toBeUndefined();
        });

        it('should return yellow at warning threshold', () => {
            expect(getContextThresholdColor(makeItem(), 50)).toBe('yellow');
        });

        it('should return yellow between warning and critical', () => {
            expect(getContextThresholdColor(makeItem(), 60)).toBe('yellow');
            expect(getContextThresholdColor(makeItem(), 74.9)).toBe('yellow');
        });

        it('should return red at critical threshold', () => {
            expect(getContextThresholdColor(makeItem(), 75)).toBe('red');
        });

        it('should return red above critical threshold', () => {
            expect(getContextThresholdColor(makeItem(), 90)).toBe('red');
            expect(getContextThresholdColor(makeItem(), 100)).toBe('red');
        });
    });

    describe('conservative preset (30/60%)', () => {
        const item = makeItem({ thresholdPreset: 'conservative' });

        it('should return undefined below 30%', () => {
            expect(getContextThresholdColor(item, 29.9)).toBeUndefined();
        });

        it('should return yellow at 30%', () => {
            expect(getContextThresholdColor(item, 30)).toBe('yellow');
        });

        it('should return red at 60%', () => {
            expect(getContextThresholdColor(item, 60)).toBe('red');
        });
    });

    describe('aggressive preset (70/90%)', () => {
        const item = makeItem({ thresholdPreset: 'aggressive' });

        it('should return undefined below 70%', () => {
            expect(getContextThresholdColor(item, 69.9)).toBeUndefined();
        });

        it('should return yellow at 70%', () => {
            expect(getContextThresholdColor(item, 70)).toBe('yellow');
        });

        it('should return red at 90%', () => {
            expect(getContextThresholdColor(item, 90)).toBe('red');
        });
    });

    describe('off preset', () => {
        it('should return undefined regardless of percentage', () => {
            const item = makeItem({ colorThresholds: 'false' });
            expect(getContextThresholdColor(item, 0)).toBeUndefined();
            expect(getContextThresholdColor(item, 50)).toBeUndefined();
            expect(getContextThresholdColor(item, 100)).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('should handle 0% usage', () => {
            expect(getContextThresholdColor(makeItem(), 0)).toBeUndefined();
        });

        it('should handle 100% usage', () => {
            expect(getContextThresholdColor(makeItem(), 100)).toBe('red');
        });

        it('should handle no metadata', () => {
            const item = makeItem(undefined);
            expect(getContextThresholdColor(item, 60)).toBe('yellow');
        });
    });
});

describe('getCurrentPreset', () => {
    it('should return default when no metadata', () => {
        expect(getCurrentPreset(makeItem())).toBe('default');
    });

    it('should return the configured preset', () => {
        expect(getCurrentPreset(makeItem({ thresholdPreset: 'conservative' }))).toBe('conservative');
        expect(getCurrentPreset(makeItem({ thresholdPreset: 'aggressive' }))).toBe('aggressive');
    });

    it('should return off when colorThresholds is false', () => {
        expect(getCurrentPreset(makeItem({ colorThresholds: 'false' }))).toBe('off');
    });
});

describe('getPresetLabel', () => {
    it('should return correct labels for all presets', () => {
        expect(getPresetLabel('default')).toBe('thresholds: 50/75%');
        expect(getPresetLabel('conservative')).toBe('thresholds: 30/60%');
        expect(getPresetLabel('aggressive')).toBe('thresholds: 70/90%');
        expect(getPresetLabel('off')).toBe('thresholds: off');
    });
});

describe('THRESHOLD_CYCLE_ORDER', () => {
    it('should cycle through all four presets', () => {
        expect(THRESHOLD_CYCLE_ORDER).toEqual(['default', 'conservative', 'aggressive', 'off']);
    });
});
