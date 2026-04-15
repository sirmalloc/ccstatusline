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

function createItem(
    type: string,
    options: {
        rawValue?: boolean;
        metadata?: Record<string, string>;
    } = {}
): WidgetItem {
    return {
        id: type,
        type,
        rawValue: options.rawValue,
        metadata: options.metadata
    };
}

describe('OutputSpeedWidget', () => {
    const widget = new OutputSpeedWidget();

    it('should report Token Speed category', () => {
        expect(widget.getCategory()).toBe('Token Speed');
    });

    it('should describe session-average behavior and window override', () => {
        expect(widget.getDescription()).toContain('session-average');
        expect(widget.getDescription()).toContain('0-120');
    });

    it('should expose a window editor keybind', () => {
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'w', label: '(w)indow', action: 'edit-window' }
        ]);
    });

    it('should show session average as the default editor modifier', () => {
        expect(widget.getEditorDisplay(createItem('output-speed')).modifierText).toBe('(session avg)');
    });

    it('should render session preview value by default', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('output-speed'), context, DEFAULT_SETTINGS)).toBe('Out: 42.5 t/s');
    });

    it('should render window preview when window metadata is enabled', () => {
        const context: RenderContext = { isPreview: true };
        const item = createItem('output-speed', { metadata: { windowSeconds: '45' } });
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Out: 26.8 t/s');
    });

    it('should calculate output speed from session speedMetrics when window is disabled', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ outputTokens: 500, totalDurationMs: 10000 }) };
        expect(widget.render(createItem('output-speed'), context, DEFAULT_SETTINGS)).toBe('Out: 50.0 t/s');
    });

    it('should calculate output speed from windowed metrics when window is enabled', () => {
        const context: RenderContext = { windowedSpeedMetrics: { 90: createSpeedMetrics({ outputTokens: 720, totalDurationMs: 6000 }) } };
        const item = createItem('output-speed', { metadata: { windowSeconds: '90' } });

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Out: 120.0 t/s');
    });

    describe('getValue', () => {
        it('should declare number value type', () => {
            expect(widget.getValueType()).toBe('number');
        });

        it('should extract numeric value from preview mode', () => {
            const context: RenderContext = { isPreview: true };
            expect(widget.getValue(context, createItem('output-speed'))).toBe(42.5);
        });

        it('should extract numeric value from preview mode (windowed)', () => {
            const context: RenderContext = { isPreview: true };
            const item = createItem('output-speed', { metadata: { windowSeconds: '45' } });
            expect(widget.getValue(context, item)).toBe(26.8);
        });

        it('should extract numeric value from live session metrics', () => {
            const context: RenderContext = { speedMetrics: createSpeedMetrics({ outputTokens: 500, totalDurationMs: 10000 }) };
            expect(widget.getValue(context, createItem('output-speed'))).toBe(50.0);
        });

        it('should extract numeric value from live windowed metrics', () => {
            const context: RenderContext = { windowedSpeedMetrics: { 90: createSpeedMetrics({ outputTokens: 720, totalDurationMs: 6000 }) } };
            const item = createItem('output-speed', { metadata: { windowSeconds: '90' } });
            expect(widget.getValue(context, item)).toBe(120.0);
        });

        it('should return null when metrics are missing', () => {
            const context: RenderContext = {};
            expect(widget.getValue(context, createItem('output-speed'))).toBeNull();
        });
    });
});

describe('InputSpeedWidget', () => {
    const widget = new InputSpeedWidget();

    it('should report Token Speed category', () => {
        expect(widget.getCategory()).toBe('Token Speed');
    });

    it('should show configured window modifier in editor display', () => {
        const item = createItem('input-speed', { metadata: { windowSeconds: '75' } });
        expect(widget.getEditorDisplay(item).modifierText).toBe('(75s window)');
    });

    it('should render session preview by default and raw variant', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('input-speed'), context, DEFAULT_SETTINGS)).toBe('In: 85.2 t/s');
        expect(widget.render(createItem('input-speed', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('85.2 t/s');
    });

    it('should use windowed speed metrics for render output when configured', () => {
        const context: RenderContext = { windowedSpeedMetrics: { 45: createSpeedMetrics({ inputTokens: 450, totalDurationMs: 3000 }) } };
        const item = createItem('input-speed', { metadata: { windowSeconds: '45' } });

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('In: 150.0 t/s');
    });

    it('should treat 0 as disabled window and use session metrics', () => {
        const context: RenderContext = { speedMetrics: createSpeedMetrics({ inputTokens: 200, totalDurationMs: 2000 }) };
        const item = createItem('input-speed', { metadata: { windowSeconds: '0' } });

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('In: 100.0 t/s');
    });

    describe('getValue', () => {
        it('should declare number value type', () => {
            expect(widget.getValueType()).toBe('number');
        });

        it('should extract numeric value from preview mode', () => {
            const context: RenderContext = { isPreview: true };
            expect(widget.getValue(context, createItem('input-speed'))).toBe(85.2);
        });

        it('should extract numeric value from preview mode (windowed)', () => {
            const context: RenderContext = { isPreview: true };
            const item = createItem('input-speed', { metadata: { windowSeconds: '45' } });
            expect(widget.getValue(context, item)).toBe(31.5);
        });

        it('should extract numeric value from live session metrics', () => {
            const context: RenderContext = { speedMetrics: createSpeedMetrics({ inputTokens: 800, totalDurationMs: 4000 }) };
            expect(widget.getValue(context, createItem('input-speed'))).toBe(200.0);
        });

        it('should extract numeric value from live windowed metrics', () => {
            const context: RenderContext = { windowedSpeedMetrics: { 45: createSpeedMetrics({ inputTokens: 450, totalDurationMs: 3000 }) } };
            const item = createItem('input-speed', { metadata: { windowSeconds: '45' } });
            expect(widget.getValue(context, item)).toBe(150.0);
        });

        it('should return null when metrics are missing', () => {
            const context: RenderContext = {};
            expect(widget.getValue(context, createItem('input-speed'))).toBeNull();
        });
    });
});

describe('TotalSpeedWidget', () => {
    const widget = new TotalSpeedWidget();

    it('should report Token Speed category', () => {
        expect(widget.getCategory()).toBe('Token Speed');
    });

    it('should clamp invalid editor metadata to supported range', () => {
        const item = createItem('total-speed', { metadata: { windowSeconds: '999' } });
        expect(widget.getEditorDisplay(item).modifierText).toBe('(120s window)');
    });

    it('should render preview values', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(createItem('total-speed'), context, DEFAULT_SETTINGS)).toBe('Total: 127.7 t/s');
        expect(widget.render(createItem('total-speed', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('127.7 t/s');
    });

    it('should compute total speed from selected window metrics', () => {
        const context: RenderContext = { windowedSpeedMetrics: { 30: createSpeedMetrics({ totalTokens: 300, totalDurationMs: 2000 }) } };
        const item = createItem('total-speed', { metadata: { windowSeconds: '30' } });

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Total: 150.0 t/s');
    });

    it('should return null when windowed metrics are missing for enabled window', () => {
        const context: RenderContext = {};
        const item = createItem('total-speed', { metadata: { windowSeconds: '15' } });

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBeNull();
    });

    describe('getValue', () => {
        it('should declare number value type', () => {
            expect(widget.getValueType()).toBe('number');
        });

        it('should extract numeric value from preview mode (session avg)', () => {
            const context: RenderContext = { isPreview: true };
            expect(widget.getValue(context, createItem('total-speed'))).toBe(127.7);
        });

        it('should extract numeric value from preview mode (windowed)', () => {
            const context: RenderContext = { isPreview: true };
            const item = createItem('total-speed', { metadata: { windowSeconds: '30' } });
            expect(widget.getValue(context, item)).toBe(58.3);
        });

        it('should extract numeric value from live session metrics', () => {
            const context: RenderContext = { speedMetrics: createSpeedMetrics({ totalTokens: 750, totalDurationMs: 5000 }) };
            expect(widget.getValue(context, createItem('total-speed'))).toBe(150.0);
        });

        it('should extract numeric value from live windowed metrics', () => {
            const context: RenderContext = { windowedSpeedMetrics: { 60: createSpeedMetrics({ totalTokens: 600, totalDurationMs: 4000 }) } };
            const item = createItem('total-speed', { metadata: { windowSeconds: '60' } });
            expect(widget.getValue(context, item)).toBe(150.0);
        });

        it('should return null when metrics are missing', () => {
            const context: RenderContext = {};
            expect(widget.getValue(context, createItem('total-speed'))).toBeNull();
        });
    });
});