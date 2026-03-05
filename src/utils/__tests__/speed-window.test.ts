import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    DEFAULT_SPEED_WINDOW_SECONDS,
    clampSpeedWindowSeconds,
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled,
    withWidgetSpeedWindowSeconds
} from '../speed-window';

function createWidget(metadata?: Record<string, string>): WidgetItem {
    return {
        id: 'speed-widget',
        type: 'total-speed',
        metadata
    };
}

describe('speed-window helpers', () => {
    it('clamps values to the supported range', () => {
        expect(clampSpeedWindowSeconds(-1)).toBe(0);
        expect(clampSpeedWindowSeconds(0)).toBe(0);
        expect(clampSpeedWindowSeconds(90)).toBe(90);
        expect(clampSpeedWindowSeconds(300)).toBe(120);
    });

    it('returns default window seconds when metadata is missing or invalid', () => {
        expect(getWidgetSpeedWindowSeconds(createWidget())).toBe(DEFAULT_SPEED_WINDOW_SECONDS);
        expect(getWidgetSpeedWindowSeconds(createWidget({ windowSeconds: 'abc' }))).toBe(DEFAULT_SPEED_WINDOW_SECONDS);
    });

    it('parses and clamps widget metadata window seconds', () => {
        expect(getWidgetSpeedWindowSeconds(createWidget({ windowSeconds: '45' }))).toBe(45);
        expect(getWidgetSpeedWindowSeconds(createWidget({ windowSeconds: '999' }))).toBe(120);
    });

    it('stores clamped window seconds in metadata while preserving existing keys', () => {
        const updated = withWidgetSpeedWindowSeconds(createWidget({ keep: 'true' }), -3);
        expect(updated.metadata).toEqual({
            keep: 'true',
            windowSeconds: '0'
        });
    });

    it('treats zero as disabled and positive values as enabled', () => {
        expect(isWidgetSpeedWindowEnabled(createWidget())).toBe(false);
        expect(isWidgetSpeedWindowEnabled(createWidget({ windowSeconds: '0' }))).toBe(false);
        expect(isWidgetSpeedWindowEnabled(createWidget({ windowSeconds: '30' }))).toBe(true);
    });
});