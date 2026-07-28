import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getPowerlineTheme } from '../colors';
import { getEffectiveThemeColors } from '../effective-theme-colors';

const THEME_NAME = 'nord-aurora';

const THEMED_SETTINGS = {
    ...DEFAULT_SETTINGS,
    colorLevel: 3 as const,
    powerline: {
        ...DEFAULT_SETTINGS.powerline,
        enabled: true,
        theme: THEME_NAME
    }
};

function themeSlot(index: number): { fg: string; bg: string } {
    const theme = getPowerlineTheme(THEME_NAME);
    const level = theme?.['3'];
    if (!level) {
        throw new Error(`Theme ${THEME_NAME} has no truecolor level`);
    }

    return {
        fg: level.fg[index % level.fg.length] ?? '',
        bg: level.bg[index % level.bg.length] ?? ''
    };
}

describe('getEffectiveThemeColors', () => {
    it('is empty when no theme is driving the colors', () => {
        const widgets: WidgetItem[] = [{ id: '1', type: 'model' }];

        expect(getEffectiveThemeColors(widgets, DEFAULT_SETTINGS).size).toBe(0);
        expect(getEffectiveThemeColors(widgets, {
            ...THEMED_SETTINGS,
            powerline: {
                ...THEMED_SETTINGS.powerline,
                theme: 'custom'
            }
        }).size).toBe(0);
        expect(getEffectiveThemeColors(widgets, {
            ...THEMED_SETTINGS,
            powerline: {
                ...THEMED_SETTINGS.powerline,
                enabled: false
            }
        }).size).toBe(0);
    });

    it('gives each widget the theme colors of its slot', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'git-branch' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS);

        expect(colors.get('1')).toEqual({
            fg: themeSlot(0).fg,
            bg: themeSlot(0).bg
        });
        expect(colors.get('2')).toEqual({
            fg: themeSlot(1).fg,
            bg: themeSlot(1).bg
        });
    });

    it('shares one slot between merged widgets', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'model',
                merge: true
            },
            { id: '2', type: 'git-branch' },
            { id: '3', type: 'context-length' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS);

        expect(colors.get('2')).toEqual(colors.get('1'));
        expect(colors.get('3')?.fg).toBe(themeSlot(1).fg);
    });

    it('skips separators without consuming a slot', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'git-branch' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS);

        expect(colors.has('2')).toBe(false);
        expect(colors.get('3')?.fg).toBe(themeSlot(1).fg);
    });

    it('omits channels the widget keeps for itself', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'model',
                color: 'hex:FF0000',
                pinColor: true
            },
            {
                id: '2',
                type: 'git-branch',
                backgroundColor: 'hex:00FF00',
                pinBackgroundColor: true
            }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS);

        expect(colors.get('1')?.fg).toBeUndefined();
        expect(colors.get('1')?.bg).toBe(themeSlot(0).bg);
        expect(colors.get('2')?.fg).toBe(themeSlot(1).fg);
        expect(colors.get('2')?.bg).toBeUndefined();
    });

    it('leaves a preserve-colors custom command its own foreground', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'custom-command',
                preserveColors: true
            }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS);

        expect(colors.get('1')?.fg).toBeUndefined();
        expect(colors.get('1')?.bg).toBe(themeSlot(0).bg);
    });
});
