import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    getWidgetRowLabel,
    getWidgetRowTags
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

    it('hides pin tags when no theme is driving the colors', () => {
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'model',
            pinColor: true
        }];

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
