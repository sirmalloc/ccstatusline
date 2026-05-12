import {
    beforeEach,
    describe,
    expect,
    test,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../../types/Widget';
import { clearGitCache } from '../git';
import {
    getValueFromRender,
    getWidgetValue
} from '../widget-values';
import * as widgetsModule from '../widgets';

function createMockWidget(overrides: Partial<Widget> = {}): Widget {
    return {
        getDefaultColor: () => 'white',
        getDescription: () => 'test',
        getDisplayName: () => 'Test',
        getCategory: () => 'Test',
        getEditorDisplay: () => ({ displayText: 'test' }),
        render: () => 'rendered',
        supportsRawValue: () => true,
        supportsColors: () => true,
        ...overrides
    };
}

describe('Widget Values', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        clearGitCache();
    });

    describe('getWidgetValue dispatch: uses getValue when available', () => {
        test('calls getValue and returns its result when widget implements it', () => {
            const getValueSpy = vi.fn().mockReturnValue(42);
            const mockWidget = createMockWidget({ getValue: getValueSpy });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'test', type: 'test-widget' };
            const value = getWidgetValue('test-widget', context, item);

            expect(getValueSpy).toHaveBeenCalledWith(context, item);
            expect(value).toBe(42);
            expect(typeof value).toBe('number');
        });

        test('returns boolean from getValue when widget returns boolean', () => {
            const mockWidget = createMockWidget({ getValue: () => true });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const value = getWidgetValue('test-widget', {}, { id: 'test', type: 'test-widget' });
            expect(value).toBe(true);
            expect(typeof value).toBe('boolean');
        });

        test('returns null from getValue when widget returns null', () => {
            const mockWidget = createMockWidget({ getValue: () => null });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const value = getWidgetValue('test-widget', {}, { id: 'test', type: 'test-widget' });
            expect(value).toBeNull();
        });

        test('does not call render when getValue is available', () => {
            const renderSpy = vi.fn().mockReturnValue('should-not-be-used');
            const mockWidget = createMockWidget({
                getValue: () => 99,
                render: renderSpy
            });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            getWidgetValue('test-widget', {}, { id: 'test', type: 'test-widget' });
            expect(renderSpy).not.toHaveBeenCalled();
        });
    });

    describe('getWidgetValue fallback: renders raw when getValue not implemented', () => {
        test('returns string from model via raw render', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const value = getWidgetValue('model', context, { id: 'test', type: 'model' });
            expect(value).toBe('claude-opus-4-6');
            expect(typeof value).toBe('string');
        });

        test('uses rawValue mode when widget supports it', () => {
            const renderSpy = vi.fn().mockReturnValue('raw-output');
            const mockWidget = createMockWidget({
                render: renderSpy,
                supportsRawValue: () => true
            });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const item: WidgetItem = { id: 'test', type: 'test-widget' };
            const value = getWidgetValue('test-widget', {}, item);

            expect(renderSpy).toHaveBeenCalledWith(
                { ...item, rawValue: true },
                {},
                DEFAULT_SETTINGS
            );
            expect(value).toBe('raw-output');
        });

        test('renders normally when widget does not support rawValue', () => {
            const renderSpy = vi.fn().mockReturnValue('normal-output');
            const mockWidget = createMockWidget({
                render: renderSpy,
                supportsRawValue: () => false
            });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const item: WidgetItem = { id: 'test', type: 'test-widget' };
            const value = getWidgetValue('test-widget', {}, item);

            expect(renderSpy).toHaveBeenCalledWith(
                item,
                {},
                DEFAULT_SETTINGS
            );
            expect(value).toBe('normal-output');
        });

        test('returns null for empty rendered output', () => {
            const value = getWidgetValue('custom-text', {}, { id: 'test', type: 'custom-text' });
            expect(value).toBeNull();
        });

        test('returns null when render returns null', () => {
            const mockWidget = createMockWidget({ render: () => null });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const value = getWidgetValue('test-widget', {}, { id: 'test', type: 'test-widget' });
            expect(value).toBeNull();
        });

        test('trims whitespace from rendered output', () => {
            const mockWidget = createMockWidget({ render: () => '  some value  ' });

            vi.spyOn(widgetsModule, 'getWidget').mockReturnValue(mockWidget);

            const value = getWidgetValue('test-widget', {}, { id: 'test', type: 'test-widget' });
            expect(value).toBe('some value');
        });
    });

    describe('getWidgetValue: returns null for unknown widget types', () => {
        test('returns null for unknown widget type', () => {
            const value = getWidgetValue('unknown-widget', {}, { id: 'test', type: 'unknown-widget' });
            expect(value).toBeNull();
        });

        test('returns null for empty string widget type', () => {
            const value = getWidgetValue('', {}, { id: 'test', type: '' });
            expect(value).toBeNull();
        });
    });

    describe('getValueFromRender: applies parser correctly', () => {
        test('parses rendered output as number', () => {
            const mockWidget = createMockWidget({ render: () => '42' });

            const result = getValueFromRender(
                mockWidget,
                {},
                { id: 'test', type: 'test' },
                (val) => {
                    const n = Number(val);
                    return isNaN(n) ? null : n;
                }
            );

            expect(result).toBe(42);
        });

        test('parses rendered output as boolean', () => {
            const mockWidget = createMockWidget({ render: () => 'true' });

            const result = getValueFromRender(
                mockWidget,
                {},
                { id: 'test', type: 'test' },
                val => val === 'true'
            );

            expect(result).toBe(true);
        });

        test('returns null when render returns null', () => {
            const mockWidget = createMockWidget({ render: () => null });

            const result = getValueFromRender(
                mockWidget,
                {},
                { id: 'test', type: 'test' },
                (val) => {
                    const n = Number(val);
                    return isNaN(n) ? null : n;
                }
            );

            expect(result).toBeNull();
        });

        test('returns null when render returns empty string', () => {
            const mockWidget = createMockWidget({ render: () => '  ' });

            const result = getValueFromRender(
                mockWidget,
                {},
                { id: 'test', type: 'test' },
                (val) => {
                    const n = Number(val);
                    return isNaN(n) ? null : n;
                }
            );

            expect(result).toBeNull();
        });

        test('returns null when parser returns null for non-numeric string', () => {
            const mockWidget = createMockWidget({ render: () => 'not-a-number' });

            const result = getValueFromRender(
                mockWidget,
                {},
                { id: 'test', type: 'test' },
                (val) => {
                    const n = Number(val);
                    return isNaN(n) ? null : n;
                }
            );

            expect(result).toBeNull();
        });

        test('uses DEFAULT_SETTINGS when rendering', () => {
            const renderSpy = vi.fn().mockReturnValue('100');
            const mockWidget = createMockWidget({ render: renderSpy });

            const item: WidgetItem = { id: 'test', type: 'test' };
            getValueFromRender(
                mockWidget,
                {},
                item,
                val => Number(val)
            );

            expect(renderSpy).toHaveBeenCalledWith(
                { ...item, rawValue: true },
                {},
                DEFAULT_SETTINGS
            );
        });
    });
});
