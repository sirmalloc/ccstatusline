import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import {
    clearAllWidgetStyling,
    cycleWidgetColor,
    resetWidgetStyling,
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

    it('resetWidgetStyling removes color, backgroundColor, and bold from one widget', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'tokens-input',
                color: 'red',
                backgroundColor: 'blue',
                bold: true
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
                bold: true
            },
            { id: '2', type: 'tokens-output', color: 'white', bold: true }
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