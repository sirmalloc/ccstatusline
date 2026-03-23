import {
    describe,
    expect,
    test,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as colorsModule from '../colors';
import {
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

describe('Renderer with Rules', () => {
    const baseSettings = {
        ...DEFAULT_SETTINGS,
        colorLevel: 3 as const,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            enabled: false
        }
    };

    const createContext = (usedPercentage: number): RenderContext => ({
        data: {
            context_window: {
                context_window_size: 200000,
                total_input_tokens: usedPercentage * 2000,
                total_output_tokens: 0,
                current_usage: usedPercentage * 2000,
                used_percentage: usedPercentage,
                remaining_percentage: 100 - usedPercentage
            }
        },
        terminalWidth: 120,
        isPreview: false
    });

    test('preRenderAllWidgets applies rule color when condition matches', () => {
        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'green',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' },
                    stop: false
                }
            ]
        };

        const lines = [[widget]];

        // 80% should trigger rule
        const highContext = createContext(80);
        const preRendered = preRenderAllWidgets(lines, baseSettings, highContext);

        // The preRendered widget should have red color applied
        expect(preRendered[0]?.[0]?.widget.color).toBe('red');
    });

    test('preRenderAllWidgets keeps base color when condition does not match', () => {
        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'green',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' },
                    stop: false
                }
            ]
        };

        const lines = [[widget]];

        // 30% should NOT trigger rule
        const lowContext = createContext(30);
        const preRendered = preRenderAllWidgets(lines, baseSettings, lowContext);

        // The preRendered widget should keep green color
        expect(preRendered[0]?.[0]?.widget.color).toBe('green');
    });

    test('preRenderAllWidgets applies rule bold override', () => {
        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'white',
            bold: false,
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { bold: true },
                    stop: false
                }
            ]
        };

        const lines = [[widget]];
        const highContext = createContext(80);
        const preRendered = preRenderAllWidgets(lines, baseSettings, highContext);

        expect(preRendered[0]?.[0]?.widget.bold).toBe(true);
    });

    test('preRenderAllWidgets applies rule background color', () => {
        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { backgroundColor: 'red' },
                    stop: false
                }
            ]
        };

        const lines = [[widget]];
        const highContext = createContext(80);
        const preRendered = preRenderAllWidgets(lines, baseSettings, highContext);

        expect(preRendered[0]?.[0]?.widget.backgroundColor).toBe('red');
    });

    test('multiple rules accumulate properties when stop is false', () => {
        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 30 },
                    apply: { bold: true },
                    stop: false
                },
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' },
                    stop: false
                }
            ]
        };

        const lines = [[widget]];
        const highContext = createContext(80);
        const preRendered = preRenderAllWidgets(lines, baseSettings, highContext);

        // Both rules should apply
        expect(preRendered[0]?.[0]?.widget.bold).toBe(true);
        expect(preRendered[0]?.[0]?.widget.color).toBe('red');
    });

    test('renderStatusLine uses rule-applied color, not base widget color', () => {
        // This test would FAIL without the fix to use effectiveWidget
        const applyColorsSpy = vi.spyOn(colorsModule, 'applyColors');

        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'green',  // Base color
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' },  // Rule overrides to red
                    stop: false
                }
            ]
        };

        const lines = [[widget]];
        const highContext = createContext(80);  // 80% > 50%, rule matches
        const preRendered = preRenderAllWidgets(lines, baseSettings, highContext);

        // Verify preRender applied the rule
        expect(preRendered[0]?.[0]?.widget.color).toBe('red');

        // Now render - this is where the bug was
        renderStatusLine([widget], baseSettings, highContext, preRendered[0] ?? [], []);

        // Find the call that rendered our widget (not separators, etc)
        // applyColors is called with (text, fgColor, bgColor, bold, level)
        const widgetRenderCall = applyColorsSpy.mock.calls.find(
            call => call[0].includes('80.0%')  // Our widget content
        );

        expect(widgetRenderCall).toBeDefined();
        // The foreground color (2nd arg) should be 'red' from the rule, NOT 'green' from base
        expect(widgetRenderCall?.[1]).toBe('red');

        applyColorsSpy.mockRestore();
    });

    test('renderStatusLine uses rule-applied bold, not base widget bold', () => {
        const applyColorsSpy = vi.spyOn(colorsModule, 'applyColors');

        const widget: WidgetItem = {
            id: 'test-1',
            type: 'context-percentage',
            color: 'white',
            bold: false,  // Base: not bold
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { bold: true },  // Rule makes it bold
                    stop: false
                }
            ]
        };

        const lines = [[widget]];
        const highContext = createContext(80);
        const preRendered = preRenderAllWidgets(lines, baseSettings, highContext);

        renderStatusLine([widget], baseSettings, highContext, preRendered[0] ?? [], []);

        const widgetRenderCall = applyColorsSpy.mock.calls.find(
            call => call[0].includes('80.0%')
        );

        expect(widgetRenderCall).toBeDefined();
        // The bold flag (4th arg) should be true from the rule
        expect(widgetRenderCall?.[3]).toBe(true);

        applyColorsSpy.mockRestore();
    });
});