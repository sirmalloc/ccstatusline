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

    it('lets a global background override beat the widget when powerline is off', () => {
        const styled = styleWidgetRowLabel('Model', {
            ...WIDGET,
            backgroundColor: 'hex:112233'
        }, {
            ...DEFAULT_SETTINGS,
            colorLevel: 3 as const,
            overrideBackgroundColor: 'hex:0000FF'
        });

        expect(styled).toContain('48;2;0;0;255');
        expect(styled).not.toContain('48;2;17;34;51');
    });

    it('ignores a global background override under powerline, where the renderer never reads it', () => {
        const styled = styleWidgetRowLabel('Model', WIDGET, {
            ...THEMED_SETTINGS,
            overrideBackgroundColor: 'hex:0000FF'
        }, THEME_CHANNELS);

        // renderPowerlineStatusLine contains no reference to overrideBackgroundColor - only the
        // standard path applies it. A row painted blue here advertises a colour that never renders.
        expect(styled).toContain('48;2;191;97;106');
        expect(styled).not.toContain('48;2;0;0;255');
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

    it('collapses a gradient at the color level in use, not always at truecolor', () => {
        const widget: WidgetItem = {
            id: '1',
            type: 'model',
            color: 'gradient:FF0000-0000FF'
        };

        // A gradient the renderer suppresses entirely at ansi16 - collapsing it to a hex value
        // first would smuggle a truecolor escape into Basic/No Color mode.
        const ansi16 = styleWidgetRowLabel('Model', widget, {
            ...THEMED_SETTINGS,
            colorLevel: 1 as const
        });
        expect(ansi16).toBe('Model');

        const ansi256 = styleWidgetRowLabel('Model', widget, {
            ...THEMED_SETTINGS,
            colorLevel: 2 as const
        });
        expect(ansi256).toContain('38;5;');
        expect(ansi256).not.toContain('38;2;');
    });

    it('keeps the widget colour when a gradient override cannot render at ansi16', () => {
        const widget: WidgetItem = {
            id: '1',
            type: 'model',
            color: 'hex:CC0000'
        };
        const ansi16 = { ...DEFAULT_SETTINGS, colorLevel: 1 as const };

        // The renderer keeps the widget's own foreground here, because at ansi16 the whole-line
        // gradient pass is a no-op. Treating the override as a solid colour would diverge.
        const withOverride = styleWidgetRowLabel('Model', widget, {
            ...ansi16,
            overrideForegroundColor: 'gradient:FF0000-0000FF'
        });

        expect(withOverride).toBe(styleWidgetRowLabel('Model', widget, ansi16));
        expect(withOverride).toContain('38;2;204;0;0');
    });

    it('ignores a gradient override the renderer cannot parse', () => {
        const widget: WidgetItem = {
            id: '1',
            type: 'model',
            color: 'hex:CC0000'
        };

        // "gradient:" is only a prefix - a spec with too few resolvable stops parses to null, and
        // both render paths then fall back to the widget's own colour. Keying off the prefix
        // alone hands applyColors a spec it cannot turn into a code, so the label loses its
        // foreground entirely.
        const styled = styleWidgetRowLabel('Model', widget, {
            ...THEMED_SETTINGS,
            overrideForegroundColor: 'gradient:FF0000'
        });

        expect(styled).toContain('38;2;204;0;0');
    });

    it('drops the foreground for an unparseable gradient override off powerline, as the renderer does', () => {
        const widget: WidgetItem = {
            id: '1',
            type: 'model',
            color: 'hex:CC0000'
        };

        // The standard path clears the widget foreground for any gradient override above ansi16,
        // then paints nothing when the spec will not parse. The row shows that, rather than a
        // colour the status line has already thrown away.
        const styled = styleWidgetRowLabel('Model', widget, {
            ...DEFAULT_SETTINGS,
            colorLevel: 3 as const,
            overrideForegroundColor: 'gradient:FF0000'
        });

        expect(styled).toBe('Model');
    });

    it('paints a gradient override across the label rather than as a solid colour', () => {
        const styled = styleWidgetRowLabel('Model', WIDGET, {
            ...THEMED_SETTINGS,
            overrideForegroundColor: 'gradient:FF0000-0000FF'
        }, THEME_CHANNELS);

        // A gradient override is painted across the finished line, so every widget shows a
        // different slice of it. Collapsing it to one stop would paint every row identically.
        expect(styled).toContain('38;2;255;0;0');
        expect(styled).toContain('38;2;0;0;255');
        expect(styled).not.toContain('38;2;236;239;244');
    });
});
