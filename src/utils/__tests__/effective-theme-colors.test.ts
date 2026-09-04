import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getPowerlineTheme } from '../colors';
import {
    buildThemeSlotContexts,
    getEffectiveThemeColors,
    type ThemeSlotContext
} from '../effective-theme-colors';

const THEME_NAME = 'nord-aurora';

/** Slot context for a line where every widget produces output. */
function allRendered(widgets: WidgetItem[]): ThemeSlotContext {
    return {
        contents: widgets.map(() => 'x'),
        startIndex: 0
    };
}

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

        expect(getEffectiveThemeColors(widgets, DEFAULT_SETTINGS, allRendered(widgets)).size).toBe(0);
        expect(getEffectiveThemeColors(widgets, {
            ...THEMED_SETTINGS,
            powerline: {
                ...THEMED_SETTINGS.powerline,
                theme: 'custom'
            }
        }, allRendered(widgets)).size).toBe(0);
        expect(getEffectiveThemeColors(widgets, {
            ...THEMED_SETTINGS,
            powerline: {
                ...THEMED_SETTINGS.powerline,
                enabled: false
            }
        }, allRendered(widgets)).size).toBe(0);
    });

    it('gives each widget the theme colors of its slot', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'git-branch' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, allRendered(widgets));

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
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, allRendered(widgets));

        expect(colors.get('2')).toEqual(colors.get('1'));
        expect(colors.get('3')?.fg).toBe(themeSlot(1).fg);
    });

    it('skips separators without consuming a slot', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'git-branch' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, allRendered(widgets));

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
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, allRendered(widgets));

        expect(colors.get('1')?.fg).toBeUndefined();
        expect(colors.get('1')?.bg).toBe(themeSlot(0).bg);
        expect(colors.get('2')?.fg).toBe(themeSlot(1).fg);
        expect(colors.get('2')?.bg).toBeUndefined();
    });

    it('gives a widget that renders nothing no slot, and does not shift the ones after it', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'git-branch' },
            { id: '2', type: 'model' },
            { id: '3', type: 'version' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, {
            contents: ['', 'Sonnet', '1.0.0'],
            startIndex: 0
        });

        expect(colors.has('1')).toBe(false);
        expect(colors.get('2')?.fg).toBe(themeSlot(0).fg);
        expect(colors.get('3')?.fg).toBe(themeSlot(1).fg);
    });

    it('starts the line at the slot the theme carried over from earlier lines', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'git-branch' }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, {
            contents: ['Sonnet', 'main'],
            startIndex: 3
        });

        expect(colors.get('1')?.fg).toBe(themeSlot(3).fg);
        expect(colors.get('2')?.fg).toBe(themeSlot(4).fg);
    });

    it('leaves a preserve-colors custom command its own foreground', () => {
        const widgets: WidgetItem[] = [
            {
                id: '1',
                type: 'custom-command',
                preserveColors: true
            }
        ];
        const colors = getEffectiveThemeColors(widgets, THEMED_SETTINGS, allRendered(widgets));

        expect(colors.get('1')?.fg).toBeUndefined();
        expect(colors.get('1')?.bg).toBe(themeSlot(0).bg);
    });
});

describe('buildThemeSlotContexts', () => {
    const line = (contents: string[]) => contents.map((content, index) => ({
        content,
        widget: {
            id: `w${index}`,
            type: 'model'
        } satisfies WidgetItem
    }));

    it('restarts every line at slot 0 when the theme does not continue', () => {
        const contexts = buildThemeSlotContexts([line(['a', 'b', 'c']), line(['d'])], false);

        expect(contexts.map(context => context.startIndex)).toEqual([0, 0]);
    });

    it('resumes each line where the previous one stopped when the theme continues', () => {
        const contexts = buildThemeSlotContexts([line(['a', 'b', 'c']), line(['d']), line(['e', 'f'])], true);

        expect(contexts.map(context => context.startIndex)).toEqual([0, 3, 4]);
    });

    it('does not count a widget that renders nothing toward the next line offset', () => {
        const contexts = buildThemeSlotContexts([line(['a', '', 'c']), line(['d'])], true);

        expect(contexts[0]?.contents).toEqual(['a', '', 'c']);
        expect(contexts[1]?.startIndex).toBe(2);
    });
});
