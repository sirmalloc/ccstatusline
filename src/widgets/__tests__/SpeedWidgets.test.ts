import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    SpeedMetrics,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { InputSpeedWidget } from '../InputSpeed';
import { OutputSpeedWidget } from '../OutputSpeed';
import { TotalSpeedWidget } from '../TotalSpeed';

function createSpeedMetrics(overrides: Partial<SpeedMetrics> = {}): SpeedMetrics {
    return {
        totalDurationMs: 10000,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 5,
        ...overrides
    };
}

function createItem(type: string, rawValue = false): WidgetItem {
    return {
        id: type,
        type,
        rawValue
    };
}

describe('OutputSpeedWidget', () => {
    const widget = new OutputSpeedWidget();

    it('should return preview value in preview mode', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('output-speed'), context, DEFAULT_SETTINGS)).toBe('Out: 42.5 t/s');
    });

    it('should return raw preview value when rawValue is true', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('output-speed', true), context, DEFAULT_SETTINGS)).toBe('42.5 t/s');
    });

    it('should calculate output speed from speedMetrics', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ outputTokens: 500, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('output-speed'), context, DEFAULT_SETTINGS)).toBe('Out: 50.0 t/s');
    });

    it('should return raw value when rawValue is true', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ outputTokens: 500, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('output-speed', true), context, DEFAULT_SETTINGS)).toBe('50.0 t/s');
    });

    it('should return null when speedMetrics is undefined', () => {
        const context: RenderContext = {};
        expect(widget.render(createItem('output-speed'), context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('should use k suffix for high speeds', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ outputTokens: 10000, totalDurationMs: 1000 }) };
        expect(widget.render(createItem('output-speed', true), context, DEFAULT_SETTINGS)).toBe('10.0k t/s');
    });
});

describe('InputSpeedWidget', () => {
    const widget = new InputSpeedWidget();

    it('should return preview value in preview mode', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('input-speed'), context, DEFAULT_SETTINGS)).toBe('In: 85.2 t/s');
    });

    it('should return raw preview value when rawValue is true', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('input-speed', true), context, DEFAULT_SETTINGS)).toBe('85.2 t/s');
    });

    it('should calculate input speed from speedMetrics', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ inputTokens: 1000, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('input-speed'), context, DEFAULT_SETTINGS)).toBe('In: 100.0 t/s');
    });

    it('should return raw value when rawValue is true', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ inputTokens: 1000, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('input-speed', true), context, DEFAULT_SETTINGS)).toBe('100.0 t/s');
    });

    it('should return null when speedMetrics is undefined', () => {
        const context: RenderContext = {};
        expect(widget.render(createItem('input-speed'), context, DEFAULT_SETTINGS)).toBeNull();
    });
});

describe('TotalSpeedWidget', () => {
    const widget = new TotalSpeedWidget();

    it('should return preview value in preview mode', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('total-speed'), context, DEFAULT_SETTINGS)).toBe('Total: 127.7 t/s');
    });

    it('should return raw preview value when rawValue is true', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('total-speed', true), context, DEFAULT_SETTINGS)).toBe('127.7 t/s');
    });

    it('should calculate total speed from speedMetrics', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ totalTokens: 1500, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('total-speed'), context, DEFAULT_SETTINGS)).toBe('Total: 150.0 t/s');
    });

    it('should return raw value when rawValue is true', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ totalTokens: 1500, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('total-speed', true), context, DEFAULT_SETTINGS)).toBe('150.0 t/s');
    });

    it('should return null when speedMetrics is undefined', () => {
        const context: RenderContext = {};
        expect(widget.render(createItem('total-speed'), context, DEFAULT_SETTINGS)).toBeNull();
    });
});