import type { ColorLevelString } from '../../types/ColorLevel';
import type { WidgetItem } from '../../types/Widget';
import { getColorAnsiCode } from '../../utils/colors';

import {
    removeMetadataKeys,
    setMetadataValue
} from './metadata';
import { getLabel } from './raw-or-labeled';

// Optional per-family colors for the Model widget. Every option stores nothing
// while at its default, so a Model widget nobody has customized keeps an
// empty metadata object.
const FAMILY_COLORS_KEY = 'familyColors';
const FAMILY_COLOR_KEY_PREFIX = 'familyColor.';

export const MODEL_LABEL = 'Model: ';

export const MODEL_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;
export type ModelFamily = typeof MODEL_FAMILIES[number];

// Basic named colors, so they follow the terminal theme and need no fallback
// on 16-color terminals
const DEFAULT_FAMILY_COLORS: Record<ModelFamily, string> = {
    opus: 'magenta',
    sonnet: 'cyan',
    haiku: 'green',
    fable: 'red'
};

/** The family named in the model's display name or id, case-insensitively; null for other models. */
export function getModelFamily(displayName: string | undefined, id: string | undefined): ModelFamily | null {
    for (const name of [displayName, id]) {
        const lower = name?.toLowerCase() ?? '';
        const family = MODEL_FAMILIES.find(candidate => lower.includes(candidate));
        if (family) {
            return family;
        }
    }
    return null;
}

export function isFamilyColorsEnabled(item: WidgetItem): boolean {
    return item.metadata?.[FAMILY_COLORS_KEY] === 'true';
}

export function setFamilyColorsEnabled(item: WidgetItem, enabled: boolean): WidgetItem {
    return setMetadataValue(item, FAMILY_COLORS_KEY, enabled ? 'true' : null);
}

export function getFamilyColor(item: WidgetItem, family: ModelFamily): string {
    return item.metadata?.[`${FAMILY_COLOR_KEY_PREFIX}${family}`] ?? DEFAULT_FAMILY_COLORS[family];
}

// A null color restores the family's default
export function setFamilyColor(item: WidgetItem, family: ModelFamily, color: string | null): WidgetItem {
    return setMetadataValue(item, `${FAMILY_COLOR_KEY_PREFIX}${family}`, color);
}

export function resetFamilyColors(item: WidgetItem): WidgetItem {
    const colorKeys = Object.keys(item.metadata ?? {}).filter(key => key.startsWith(FAMILY_COLOR_KEY_PREFIX));
    return removeMetadataKeys(item, colorKeys);
}

export interface ModelFormatOptions {
    colorLevel: ColorLevelString;
    colorsDisabled: boolean;
}

export function formatModelName(item: WidgetItem, name: string, family: ModelFamily | null, options: ModelFormatOptions): string {
    const label = item.rawValue ? '' : getLabel(item, MODEL_LABEL);
    if (!isFamilyColorsEnabled(item) || options.colorsDisabled) {
        return `${label}${name}`;
    }

    // Only the name of a known family is painted, ending with the
    // default-foreground code; the renderer colors the label and other models
    // with the widget color (Widget.colorsOnlyItsRuns)
    const code = family ? getColorAnsiCode(getFamilyColor(item, family), options.colorLevel) : '';
    return name && code ? `${label}${code}${name}\x1b[39m` : `${label}${name}`;
}
