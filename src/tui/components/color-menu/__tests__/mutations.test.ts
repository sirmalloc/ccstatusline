import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import {
    clearAllWidgetStyling,
    cycleWidgetColor,
    cycleWidgetDim,
    resetWidgetStyling,
    setWidgetColor,
    toggleWidgetBold,
    updateWidgetById
} from '../mutations';

describe('color-menu mutations', () => {
    it('updateWidgetById only updates the matching widget', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input', color: 'blue' },
            { id: '2', type: 'tokens-output', color: 'white' }
        ];

        const updated = updateWidgetById(widgets, '1', widget => ({
            ...widget,
            color: 'red'
        }));

        expect(updated[0]?.color).toBe('red');
        expect(updated[1]?.color).toBe('white');
    });

    it('toggleWidgetBold flips bold state for the selected widget only', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input', bold: true },
            { id: '2', type: 'tokens-output', bold: false }
        ];

        const updated = toggleWidgetBold(widgets, '1');

        expect(updated[0]?.bold).toBe(false);
        expect(updated[1]?.bold).toBe(false);
    });

    it('cycleWidgetDim cycles off, whole widget, parens, then off for the selected widget only', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' }
        ];

        const whole = cycleWidgetDim(widgets, '1');
        const parens = cycleWidgetDim(whole, '1');
        const off = cycleWidgetDim(parens, '1');

        expect(whole[0]?.dim).toBe(true);
        expect(parens[0]?.dim).toBe('parens');
        expect(off[0]).toEqual({ id: '1', type: 'tokens-input' });
        expect(whole[1]?.dim).toBeUndefined();
    });

    it('resetWidgetStyling removes color, backgroundColor, bold, and dim from one widget', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'tokens-input',
                color: 'red',
                backgroundColor: 'blue',
                bold: true,
                dim: 'parens'
            },
            { id: '2', type: 'tokens-output', color: 'white', bold: true }
        ];

        const updated = resetWidgetStyling(widgets, '1');

        expect(updated[0]).toEqual({ id: '1', type: 'tokens-input' });
        expect(updated[1]).toEqual({ id: '2', type: 'tokens-output', color: 'white', bold: true });
    });

    it('clearAllWidgetStyling strips styling fields from every widget', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'tokens-input',
                color: 'red',
                backgroundColor: 'blue',
                bold: true,
                dim: true
            },
            { id: '2', type: 'tokens-output', color: 'white', bold: true, dim: 'parens' }
        ];

        const updated = clearAllWidgetStyling(widgets);

        expect(updated).toEqual([
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' }
        ]);
    });

    it('cycles background colors and maps empty background to undefined', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input', backgroundColor: 'bg:red' }
        ];

        const right = cycleWidgetColor({
            widgets,
            widgetId: '1',
            direction: 'right',
            editingBackground: true,
            colors: ['blue', 'red'],
            backgroundColors: ['bg:red', '']
        });
        const left = cycleWidgetColor({
            widgets: right,
            widgetId: '1',
            direction: 'left',
            editingBackground: true,
            colors: ['blue', 'red'],
            backgroundColors: ['bg:red', '']
        });

        expect(right[0]?.backgroundColor).toBeUndefined();
        expect(left[0]?.backgroundColor).toBe('bg:red');
    });

    it('cycles foreground colors from widget default and treats dim as default', () => {
        const fromDefault: WidgetItem[] = [
            { id: '1', type: 'tokens-input' }
        ];
        const fromDim: WidgetItem[] = [
            { id: '1', type: 'tokens-input', color: 'dim' }
        ];

        const defaultCycle = cycleWidgetColor({
            widgets: fromDefault,
            widgetId: '1',
            direction: 'right',
            editingBackground: false,
            colors: ['blue', 'red'],
            backgroundColors: ['bg:red', '']
        });
        const dimCycle = cycleWidgetColor({
            widgets: fromDim,
            widgetId: '1',
            direction: 'right',
            editingBackground: false,
            colors: ['blue', 'red'],
            backgroundColors: ['bg:red', '']
        });

        expect(defaultCycle[0]?.color).toBe('red');
        expect(dimCycle[0]?.color).toBe('red');
    });
});

describe('rule-targeted mutations', () => {
    const ruled: WidgetItem[] = [{
        id: '1',
        type: 'tokens-input',
        color: 'blue',
        rules: [
            { when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } },
            { when: { widget: 'context-percentage', greaterThan: 90 }, apply: {} }
        ]
    }];

    it('writes a colour onto the rule rather than the widget', () => {
        const updated = setWidgetColor(ruled, '1', 'green', false, 1);

        expect(updated[0]?.color).toBe('blue');
        expect(updated[0]?.rules?.[1]?.apply.color).toBe('green');
        expect(updated[0]?.rules?.[0]?.apply.color).toBe('red');
    });

    it('writes a background colour onto the rule', () => {
        const updated = setWidgetColor(ruled, '1', 'bgRed', true, 0);

        expect(updated[0]?.backgroundColor).toBeUndefined();
        expect(updated[0]?.rules?.[0]?.apply.backgroundColor).toBe('bgRed');
    });

    it('toggles bold on the rule', () => {
        const on = toggleWidgetBold(ruled, '1', 0);
        expect(on[0]?.bold).toBeUndefined();
        expect(on[0]?.rules?.[0]?.apply.bold).toBe(true);

        const off = toggleWidgetBold(on, '1', 0);
        expect(off[0]?.rules?.[0]?.apply.bold).toBe(false);
    });

    it('resets only the rule it is aimed at', () => {
        const updated = resetWidgetStyling(ruled, '1', 0);

        expect(updated[0]?.color).toBe('blue');
        expect(updated[0]?.rules?.[0]?.apply).toEqual({});
        expect(updated[0]?.rules?.[0]?.when).toEqual({ widget: 'context-percentage', greaterThan: 80 });
    });

    it('cycles the rule colour, starting from the rule\'s own colour', () => {
        const updated = cycleWidgetColor({
            widgets: ruled,
            widgetId: '1',
            direction: 'right',
            editingBackground: false,
            colors: ['red', 'green', 'yellow'],
            backgroundColors: [],
            ruleIndex: 0
        });

        expect(updated[0]?.color).toBe('blue');
        expect(updated[0]?.rules?.[0]?.apply.color).toBe('green');
    });

    it('leaves the widget alone when the rule index is out of range', () => {
        const updated = setWidgetColor(ruled, '1', 'green', false, 5);

        expect(updated[0]?.color).toBe('blue');
        expect(updated[0]?.rules).toEqual(ruled[0]?.rules);
    });
});
