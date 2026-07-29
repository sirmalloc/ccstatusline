import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    getWidgetRowLabel,
    getWidgetRowTags,
    styleWidgetRowLabel
} from '../WidgetRow';

const AUTO_ALIGN_SETTINGS = {
    ...DEFAULT_SETTINGS,
    powerline: {
        ...DEFAULT_SETTINGS.powerline,
        enabled: true,
        autoAlign: true
    }
};

describe('getWidgetRowLabel', () => {
    it('names separators by their character', () => {
        expect(getWidgetRowLabel({ id: '1', type: 'separator', character: '|' }).displayText)
            .toBe('Separator |');
        expect(getWidgetRowLabel({ id: '1', type: 'separator', character: ' ' }).displayText)
            .toBe('Separator (space)');
        expect(getWidgetRowLabel({ id: '1', type: 'flex-separator' }).displayText)
            .toBe('Flex Separator');
    });

    it('uses the widget editor display for real widgets', () => {
        expect(getWidgetRowLabel({ id: '1', type: 'model' }).displayText).toBe('Model');
    });

    it('flags unknown widget types', () => {
        expect(getWidgetRowLabel({ id: '1', type: 'not-a-widget' }).displayText)
            .toBe('Unknown: not-a-widget');
    });
});

describe('getWidgetRowTags', () => {
    it('has no tags for a plain widget', () => {
        expect(getWidgetRowTags([{ id: '1', type: 'model' }], 0, DEFAULT_SETTINGS)).toEqual([]);
    });

    it('tags raw value and merge modes', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'model',
                rawValue: true,
                merge: true
            },
            {
                id: '2',
                type: 'model',
                merge: 'no-padding'
            },
            { id: '3', type: 'model' }
        ];

        expect(getWidgetRowTags(widgets, 0, DEFAULT_SETTINGS)).toEqual(['(raw value)', '(merged→)']);
        expect(getWidgetRowTags(widgets, 1, DEFAULT_SETTINGS)).toEqual(['(merged-no-pad→)']);
    });

    it('tags excluded auto-align only when auto-align applies to the row', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'model', excludeFromAutoAlign: true }
        ];

        expect(getWidgetRowTags(widgets, 1, AUTO_ALIGN_SETTINGS)).toEqual(['(no-align)']);
        expect(getWidgetRowTags(widgets, 1, DEFAULT_SETTINGS)).toEqual([]);
    });

    it('names which channels are pinned under an active theme', () => {
        const themed = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'nord-aurora'
            }
        };
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', pinColor: true },
            { id: '2', type: 'model', pinBackgroundColor: true },
            {
                id: '3',
                type: 'model',
                pinColor: true,
                pinBackgroundColor: true
            },
            { id: '4', type: 'model' }
        ];

        expect(getWidgetRowTags(widgets, 0, themed)).toEqual(['(fg pinned)']);
        expect(getWidgetRowTags(widgets, 1, themed)).toEqual(['(bg pinned)']);
        expect(getWidgetRowTags(widgets, 2, themed)).toEqual(['(fg+bg pinned)']);
        expect(getWidgetRowTags(widgets, 3, themed)).toEqual([]);
    });

    it('marks a pin as inactive when no theme is driving the colors', () => {
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'model',
            pinColor: true
        }];

        // A pin that overrides nothing right now is the one worth surfacing: it renders the
        // colour of a theme that may be long gone, and revives when any theme is enabled.
        expect(getWidgetRowTags(widgets, 0, DEFAULT_SETTINGS)).toEqual(['(fg pinned, inactive)']);
    });

    it('reports no pin tag for a widget without pins', () => {
        const widgets: WidgetItem[] = [{ id: '1', type: 'model' }];

        expect(getWidgetRowTags(widgets, 0, DEFAULT_SETTINGS)).toEqual([]);
    });

    it('drops the auto-align tag for a widget merged into the previous one', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', merge: true },
            { id: '2', type: 'model', excludeFromAutoAlign: true }
        ];

        expect(getWidgetRowTags(widgets, 1, AUTO_ALIGN_SETTINGS)).toEqual([]);
    });
});

describe('styleWidgetRowLabel', () => {
    const THEMED_SETTINGS = {
        ...DEFAULT_SETTINGS,
        colorLevel: 3 as const,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            enabled: true,
            theme: 'nord-aurora'
        }
    };
    const WIDGET: WidgetItem = { id: '1', type: 'model' };
    const THEME_CHANNELS = {
        fg: 'hex:ECEFF4',
        bg: 'hex:BF616A'
    };

    it('lets a global foreground override beat the theme', () => {
        const styled = styleWidgetRowLabel('Model', WIDGET, {
            ...THEMED_SETTINGS,
            overrideForegroundColor: 'hex:00FF00'
        }, THEME_CHANNELS);

        // The renderer forces every widget's foreground to the override, so a row painted in
        // the theme colour would advertise a colour the status line never uses.
        expect(styled).toContain('38;2;0;255;0');
        expect(styled).not.toContain('38;2;236;239;244');
    });

    it('lets a global background override beat the theme', () => {
        const styled = styleWidgetRowLabel('Model', WIDGET, {
            ...THEMED_SETTINGS,
            overrideBackgroundColor: 'hex:0000FF'
        }, THEME_CHANNELS);

        expect(styled).toContain('48;2;0;0;255');
        expect(styled).not.toContain('48;2;191;97;106');
    });

    it('ignores an override set to none', () => {
        const styled = styleWidgetRowLabel('Model', WIDGET, {
            ...THEMED_SETTINGS,
            overrideForegroundColor: 'none'
        }, THEME_CHANNELS);

        expect(styled).toContain('38;2;236;239;244');
    });

    it('applies globalBold even when the widget is not bold', () => {
        const plain = styleWidgetRowLabel('Model', WIDGET, THEMED_SETTINGS, THEME_CHANNELS);
        const bolded = styleWidgetRowLabel('Model', WIDGET, {
            ...THEMED_SETTINGS,
            globalBold: true
        }, THEME_CHANNELS);

        expect(plain).not.toContain('\x1b[1m');
        expect(bolded).toContain('\x1b[1m');
    });

    it('collapses a gradient to its first stop under powerline', () => {
        const widget: WidgetItem = {
            id: '1',
            type: 'model',
            color: 'gradient:FF0000-0000FF'
        };
        const styled = styleWidgetRowLabel('Model', widget, THEMED_SETTINGS);

        // A powerline segment carries one colour, so the renderer emits only the first stop.
        // Painting a real per-character gradient here would not match what renders.
        expect(styled).toContain('38;2;255;0;0');
        expect(styled).not.toContain('38;2;0;0;255');
    });

    it('keeps a real gradient when powerline is off', () => {
        const widget: WidgetItem = {
            id: '1',
            type: 'model',
            color: 'gradient:FF0000-0000FF'
        };
        const styled = styleWidgetRowLabel('Model', widget, {
            ...DEFAULT_SETTINGS,
            colorLevel: 3 as const
        });

        expect(styled).toContain('38;2;255;0;0');
        expect(styled).toContain('38;2;0;0;255');
    });
});
