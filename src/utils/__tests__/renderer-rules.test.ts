import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { preRenderAllWidgets } from '../renderer';
import * as rulesEngineModule from '../rules-engine';
import * as widgetsModule from '../widgets';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

/**
 * Minimal widget implementation for testing.
 * render() returns item.customText (or null if absent).
 */
function makeFakeWidget(defaultColor = 'white') {
    return {
        getDefaultColor: () => defaultColor,
        getDescription: () => 'test',
        getDisplayName: () => 'Test',
        getCategory: () => 'test',
        getEditorDisplay: () => ({ displayText: 'test' }),
        render: (item: WidgetItem) => item.customText ?? null,
        supportsRawValue: () => false,
        supportsColors: () => true
    };
}

/** Safely get a pre-rendered widget from a result */
function getPreRendered(result: ReturnType<typeof preRenderAllWidgets>, lineIndex: number, widgetIndex: number) {
    const line = result[lineIndex];
    expect(line).toBeDefined();
    const widget = line?.at(widgetIndex);
    expect(widget).toBeDefined();
    return widget;
}

describe('renderer rules integration', () => {
    const baseContext: RenderContext = { isPreview: false, terminalWidth: 200 };
    const settings = createSettings({ colorLevel: 0 });

    let getWidgetSpy: MockInstance<typeof widgetsModule.getWidget>;
    let applyRulesSpy: MockInstance<typeof rulesEngineModule.applyRules>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();

        // Default: getWidget returns a fake for any type
        getWidgetSpy = vi.spyOn(widgetsModule, 'getWidget').mockImplementation(() => makeFakeWidget());

        // Default: applyRules returns the widget unchanged
        applyRulesSpy = vi.spyOn(rulesEngineModule, 'applyRules').mockImplementation((item: WidgetItem) => item);
    });

    // --- Baseline: no rules ---

    it('renders a widget with no rules normally (baseline)', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'hello'
        };

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        // applyRules should not be called (no rules on widget)
        expect(applyRulesSpy).not.toHaveBeenCalled();

        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(1);
        const w = getPreRendered(result, 0, 0);
        expect(w?.content).toBe('hello');
    });

    // --- Matching rule overrides color ---

    it('renders with overridden color when a rule matches', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            color: 'white',
            customText: 'hello',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' }
                }
            ]
        };

        // applyRules returns widget with color changed to red
        applyRulesSpy.mockImplementation(() => ({
            ...widget,
            color: 'red'
        }));

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        expect(applyRulesSpy).toHaveBeenCalledOnce();
        expect(result[0]).toHaveLength(1);
        const w = getPreRendered(result, 0, 0);
        expect(w?.widget.color).toBe('red');
        expect(w?.content).toBe('hello');
    });

    // --- Non-matching rule renders normally ---

    it('renders normally when a rule does not match', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            color: 'white',
            customText: 'hello',
            rules: [
                {
                    when: { greaterThan: 90 },
                    apply: { color: 'red' }
                }
            ]
        };

        // applyRules returns widget unchanged (rule did not match)
        applyRulesSpy.mockImplementation((item: WidgetItem) => item);

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        expect(applyRulesSpy).toHaveBeenCalledOnce();
        const w = getPreRendered(result, 0, 0);
        expect(w?.widget.color).toBe('white');
        expect(w?.content).toBe('hello');
    });

    // --- hide: true causes widget to be skipped ---

    it('skips widget when rule applies hide: true', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'hidden',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { hide: true }
                }
            ]
        };

        // applyRules returns widget with hide: true
        applyRulesSpy.mockImplementation(() => ({
            ...widget,
            hide: true
        }));

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        expect(applyRulesSpy).toHaveBeenCalledOnce();
        // Widget should be entirely skipped -- empty pre-rendered line
        expect(result[0]).toHaveLength(0);
    });

    it('keeps other widgets when one is hidden by rules', () => {
        const visible: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'visible'
        };
        const hidden: WidgetItem = {
            id: 'w2',
            type: 'custom-text',
            customText: 'hidden',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { hide: true }
                }
            ]
        };

        applyRulesSpy.mockImplementation(() => ({
            ...hidden,
            hide: true
        }));

        const result = preRenderAllWidgets([[visible, hidden]], settings, baseContext);

        // Only the visible widget should remain
        expect(result[0]).toHaveLength(1);
        const w = getPreRendered(result, 0, 0);
        expect(w?.content).toBe('visible');
    });

    // --- Multiple rules stack correctly ---

    it('passes all line widgets to applyRules for cross-widget conditions', () => {
        const widget1: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'A',
            rules: [
                {
                    when: { widget: 'context-percentage', greaterThan: 50 },
                    apply: { color: 'red' }
                }
            ]
        };
        const widget2: WidgetItem = {
            id: 'w2',
            type: 'context-percentage',
            customText: 'B'
        };

        applyRulesSpy.mockImplementation((item: WidgetItem) => ({
            ...item,
            color: 'red'
        }));

        preRenderAllWidgets([[widget1, widget2]], settings, baseContext);

        // applyRules should be called with the full line widgets array
        expect(applyRulesSpy).toHaveBeenCalledOnce();
        const callArgs = applyRulesSpy.mock.calls[0];
        expect(callArgs).toBeDefined();
        // Third argument is the full lineWidgets array
        const lineWidgetsArg = callArgs?.[2];
        expect(lineWidgetsArg).toHaveLength(2);
        expect(lineWidgetsArg?.at(0)?.id).toBe('w1');
        expect(lineWidgetsArg?.at(1)?.id).toBe('w2');
    });

    it('stacks multiple rule overrides correctly (later rule wins for same property)', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            color: 'white',
            customText: 'hello',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'yellow' }
                },
                {
                    when: { greaterThan: 70 },
                    apply: { color: 'red', bold: true }
                }
            ]
        };

        // Simulate stacked result: both rules matched, later overrides color
        applyRulesSpy.mockImplementation(() => ({
            ...widget,
            color: 'red',
            bold: true
        }));

        const result = preRenderAllWidgets([[widget]], settings, baseContext);
        const w = getPreRendered(result, 0, 0);

        expect(w?.widget.color).toBe('red');
        expect(w?.widget.bold).toBe(true);
    });

    // --- Stop flag halts evaluation ---

    it('respects stop flag (verified via applyRules being called correctly)', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            color: 'white',
            customText: 'hello',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'yellow' },
                    stop: true
                },
                {
                    when: { greaterThan: 70 },
                    apply: { color: 'red' }
                }
            ]
        };

        // applyRules returns result as if stop halted at first rule
        applyRulesSpy.mockImplementation(() => ({
            ...widget,
            color: 'yellow'
        }));

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        expect(applyRulesSpy).toHaveBeenCalledOnce();
        const w = getPreRendered(result, 0, 0);
        expect(w?.widget.color).toBe('yellow');
    });

    // --- Separators are not evaluated for rules ---

    it('does not evaluate rules on separator widgets', () => {
        const sep: WidgetItem = {
            id: 'sep',
            type: 'separator'
        };

        preRenderAllWidgets([[sep]], settings, baseContext);

        // applyRules should not be called for separators
        expect(applyRulesSpy).not.toHaveBeenCalled();
    });

    it('does not evaluate rules on flex-separator widgets', () => {
        const sep: WidgetItem = {
            id: 'sep',
            type: 'flex-separator'
        };

        preRenderAllWidgets([[sep]], settings, baseContext);

        expect(applyRulesSpy).not.toHaveBeenCalled();
    });

    // --- Rules apply AFTER minimalist mode ---

    it('applies rules after minimalist rawValue override', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'hello',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' }
                }
            ]
        };

        const minimalistContext: RenderContext = { ...baseContext, minimalist: true };

        applyRulesSpy.mockImplementation((item: WidgetItem) => {
            // Verify the widget passed to applyRules has rawValue set by minimalist mode
            expect(item.rawValue).toBe(true);
            return { ...item, color: 'red' };
        });

        preRenderAllWidgets([[widget]], settings, minimalistContext);

        expect(applyRulesSpy).toHaveBeenCalledOnce();
    });

    it('rule overrides take precedence over minimalist rawValue', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'hello',
            rawValue: true,
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { rawValue: false }
                }
            ]
        };

        const minimalistContext: RenderContext = { ...baseContext, minimalist: true };

        // Rule override sets rawValue back to false
        applyRulesSpy.mockImplementation(() => ({
            ...widget,
            rawValue: false
        }));

        const fakeWidget = makeFakeWidget();
        const renderSpy = vi.fn().mockReturnValue('rendered');
        fakeWidget.render = renderSpy;
        getWidgetSpy.mockReturnValue(fakeWidget);

        preRenderAllWidgets([[widget]], settings, minimalistContext);

        // The widget passed to render should have rawValue: false (from rule override)
        const renderedWidget = renderSpy.mock.calls[0]?.[0] as WidgetItem | undefined;
        expect(renderedWidget?.rawValue).toBe(false);
    });

    // --- The overridden widget is passed to render ---

    it('passes the rule-overridden widget to widgetImpl.render()', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            color: 'white',
            customText: 'hello',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { customText: 'overridden' }
                }
            ]
        };

        const overriddenWidget = { ...widget, customText: 'overridden' };
        applyRulesSpy.mockImplementation(() => overriddenWidget);

        const fakeWidget = makeFakeWidget();
        const renderSpy = vi.fn().mockReturnValue('overridden');
        fakeWidget.render = renderSpy;
        getWidgetSpy.mockReturnValue(fakeWidget);

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        // Verify the overridden widget was passed to render
        const renderedWidget = renderSpy.mock.calls[0]?.[0] as WidgetItem | undefined;
        expect(renderedWidget?.customText).toBe('overridden');
        const w = getPreRendered(result, 0, 0);
        expect(w?.content).toBe('overridden');
    });

    // --- Multiple lines ---

    it('evaluates rules independently per line', () => {
        const widgetL1: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'line1',
            rules: [{ when: { equals: 'line1' }, apply: { color: 'red' } }]
        };
        const widgetL2: WidgetItem = {
            id: 'w2',
            type: 'custom-text',
            customText: 'line2',
            rules: [{ when: { equals: 'line2' }, apply: { color: 'blue' } }]
        };

        applyRulesSpy.mockImplementation((item: WidgetItem) => {
            if (item.id === 'w1')
                return { ...item, color: 'red' };
            if (item.id === 'w2')
                return { ...item, color: 'blue' };
            return item;
        });

        const result = preRenderAllWidgets([[widgetL1], [widgetL2]], settings, baseContext);

        expect(applyRulesSpy).toHaveBeenCalledTimes(2);
        const w1 = getPreRendered(result, 0, 0);
        const w2 = getPreRendered(result, 1, 0);
        expect(w1?.widget.color).toBe('red');
        expect(w2?.widget.color).toBe('blue');
    });

    // --- Widget with empty rules array is treated like no rules ---

    it('does not call applyRules when rules array is empty', () => {
        const widget: WidgetItem = {
            id: 'w1',
            type: 'custom-text',
            customText: 'hello',
            rules: []
        };

        const result = preRenderAllWidgets([[widget]], settings, baseContext);

        expect(applyRulesSpy).not.toHaveBeenCalled();
        const w = getPreRendered(result, 0, 0);
        expect(w?.content).toBe('hello');
    });
});
