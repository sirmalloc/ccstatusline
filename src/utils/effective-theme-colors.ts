import { getColorLevelString } from '../types/ColorLevel';
import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { getPowerlineTheme } from './colors';
import {
    NO_THEME_SLOT,
    assignPowerlineThemeSlots,
    computeLineThemeStartIndices,
    type PowerlineThemeSlotEntry
} from './powerline-theme-index';
import { widgetPreservesColors } from './widgets';

export interface ThemeChannelColors {
    fg?: string;
    bg?: string;
}

/**
 * What the editor needs to know about a line's surroundings to name the same theme slots
 * the renderer will. Both fields are required because defaulting either one silently
 * previews colors the status line does not actually use.
 */
export interface ThemeSlotContext {
    /** Rendered content per widget, index-aligned with the line's widgets. */
    contents: string[];
    /** Theme slot this line starts at; non-zero when the theme continues across lines. */
    startIndex: number;
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

/**
 * Slot context for every line, index-aligned with `preRenderedLines`. The editor edits one
 * line at a time but a line's colors depend on the lines before it, so this is derived once
 * from the same pre-render the preview uses.
 */
export function buildThemeSlotContexts(
    preRenderedLines: PowerlineThemeSlotEntry[][],
    continueThemeAcrossLines: boolean
): ThemeSlotContext[] {
    const startIndices = computeLineThemeStartIndices(preRenderedLines, continueThemeAcrossLines);

    return preRenderedLines.map((entries, index) => ({
        contents: entries.map(entry => entry.content),
        startIndex: startIndices[index] ?? 0
    }));
}

/**
 * Stand-in for a line with no pre-rendered content yet. Every widget reads as empty, so no
 * theme color is claimed - the editor shows each widget's own color rather than guessing at
 * a theme slot it cannot compute.
 */
export const EMPTY_THEME_SLOT_CONTEXT: ThemeSlotContext = {
    contents: [],
    startIndex: 0
};

/** Is a powerline theme currently driving widget colors? Pins only matter when it is. */
export function isPowerlineThemeActive(settings: Settings): boolean {
    return getActiveThemeColors(settings) !== undefined;
}

/** Does the theme leave this widget's foreground alone? */
export function keepsOwnForeground(widget: WidgetItem, settings: Settings): boolean {
    const hasForegroundOverride = Boolean(
        settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none'
    );

    return Boolean(widget.pinColor) || (widgetPreservesColors(widget) && !hasForegroundOverride);
}

/**
 * Theme colors that win over each widget's own color, keyed by widget id. Empty when no
 * theme is active. A channel the widget keeps for itself - a pinned color, or a custom
 * command preserving its own output colors - is left undefined, so callers fall back to
 * the widget's stored color for it.
 *
 * Slots come from assignPowerlineThemeSlots fed with the same rendered content and
 * line offset the renderer uses, so the editor cannot drift from what actually renders.
 * Global color overrides are not applied here; the editor flags those separately.
 */
export function getEffectiveThemeColors(
    widgets: WidgetItem[],
    settings: Settings,
    slotContext: ThemeSlotContext
): Map<string, ThemeChannelColors> {
    const effective = new Map<string, ThemeChannelColors>();
    const themeColors = getActiveThemeColors(settings);

    if (!themeColors) {
        return effective;
    }

    const slots = assignPowerlineThemeSlots(
        widgets.map((widget, index) => ({
            widget,
            content: slotContext.contents[index] ?? ''
        })),
        slotContext.startIndex
    );

    widgets.forEach((widget, index) => {
        const slot = slots[index];
        if (slot === undefined || slot === NO_THEME_SLOT) {
            return;
        }

        effective.set(widget.id, {
            fg: keepsOwnForeground(widget, settings)
                ? undefined
                : themeColors.fg[slot % themeColors.fg.length],
            bg: widget.pinBackgroundColor
                ? undefined
                : themeColors.bg[slot % themeColors.bg.length]
        });
    });

    return effective;
}
