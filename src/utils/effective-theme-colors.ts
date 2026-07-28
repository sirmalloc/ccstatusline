import { getColorLevelString } from '../types/ColorLevel';
import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { getPowerlineTheme } from './colors';
import {
    NO_THEME_SLOT,
    assignPowerlineThemeSlots
} from './powerline-theme-index';

export interface ThemeChannelColors {
    fg?: string;
    bg?: string;
}

/**
 * Foreground/background palettes of the active powerline theme, or undefined when no
 * theme is driving the colors (powerline off, no theme, or the 'custom' theme).
 */
export function getActiveThemeColors(settings: Settings): { fg: string[]; bg: string[] } | undefined {
    if (!settings.powerline.enabled) {
        return undefined;
    }

    const themeName = settings.powerline.theme;
    if (!themeName || themeName === 'custom') {
        return undefined;
    }

    const theme = getPowerlineTheme(themeName);
    if (!theme) {
        return undefined;
    }

    const colorLevel = getColorLevelString(settings.colorLevel);
    const colorLevelKey = colorLevel === 'ansi16' ? '1' : colorLevel === 'ansi256' ? '2' : '3';

    return theme[colorLevelKey];
}

/** Is a powerline theme currently driving widget colors? Pins only matter when it is. */
export function isPowerlineThemeActive(settings: Settings): boolean {
    return getActiveThemeColors(settings) !== undefined;
}

/** Does the theme leave this widget's foreground alone? */
export function keepsOwnForeground(widget: WidgetItem): boolean {
    return Boolean(widget.pinColor) || (widget.type === 'custom-command' && Boolean(widget.preserveColors));
}

/**
 * Theme colors that win over each widget's own color, keyed by widget id. Empty when no
 * theme is active. A channel the widget keeps for itself - a pinned color, or a custom
 * command preserving its own output colors - is left undefined, so callers fall back to
 * the widget's stored color for it.
 *
 * Slots come from assignPowerlineThemeSlots, the same assignment the renderer uses, so
 * the editor cannot drift from what actually renders. Global color overrides are not
 * applied here; the editor flags those separately.
 */
export function getEffectiveThemeColors(widgets: WidgetItem[], settings: Settings): Map<string, ThemeChannelColors> {
    const effective = new Map<string, ThemeChannelColors>();
    const themeColors = getActiveThemeColors(settings);

    if (!themeColors) {
        return effective;
    }

    // The editor has no rendered output to inspect, so every non-separator widget is
    // assumed to render - which is what the editor shows the user anyway.
    const slots = assignPowerlineThemeSlots(widgets.map(widget => ({
        widget,
        content: 'x'
    })));

    widgets.forEach((widget, index) => {
        const slot = slots[index];
        if (slot === undefined || slot === NO_THEME_SLOT) {
            return;
        }

        effective.set(widget.id, {
            fg: keepsOwnForeground(widget)
                ? undefined
                : themeColors.fg[slot % themeColors.fg.length],
            bg: widget.pinBackgroundColor
                ? undefined
                : themeColors.bg[slot % themeColors.bg.length]
        });
    });

    return effective;
}
