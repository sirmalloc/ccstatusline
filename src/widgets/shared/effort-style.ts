import type { ColorLevelString } from '../../types/ColorLevel';
import type { WidgetItem } from '../../types/Widget';
import { getColorAnsiCode } from '../../utils/colors';
import type { TranscriptThinkingEffort } from '../../utils/jsonl-metadata';

import { removeMetadataKeys } from './metadata';
import { getLabel } from './raw-or-labeled';

// Every option below stores nothing while at its default, so a Thinking
// Effort widget nobody has customized keeps an empty metadata object.
const BRACKETS_KEY = 'brackets';
const LEVEL_COLORS_KEY = 'levelColors';
const BRACKET_COLOR_KEY = 'bracketColor';
const LEVEL_COLOR_KEY_PREFIX = 'levelColor.';

export const THINKING_EFFORT_DEFAULT_COLOR = 'magenta';
export const THINKING_EFFORT_LABEL = 'Thinking: ';

export const BRACKET_STYLES = ['()', '[]', '{}', '<>'] as const;
export type BracketStyle = typeof BRACKET_STYLES[number];
export type BracketColorMode = 'effort' | 'widget';

const DEFAULT_LEVEL_COLORS: Record<TranscriptThinkingEffort, string> = {
    low: 'brightBlack',
    medium: 'green',
    high: 'yellow',
    xhigh: 'ansi256:208',
    max: 'red'
};

// The default orange has no 16-color equivalent, so basic terminals get the
// nearest distinct named color instead of an escape they can't show
const DEFAULT_LEVEL_COLORS_ANSI16: Partial<Record<TranscriptThinkingEffort, string>> = { xhigh: 'brightMagenta' };

function setMetadataValue(item: WidgetItem, key: string, value: string | null): WidgetItem {
    if (value === null) {
        return removeMetadataKeys(item, [key]);
    }

    return { ...item, metadata: { ...item.metadata, [key]: value } };
}

function isBracketStyle(value: string | undefined): value is BracketStyle {
    return value !== undefined && (BRACKET_STYLES as readonly string[]).includes(value);
}

export function getBracketStyle(item: WidgetItem): BracketStyle | null {
    const value = item.metadata?.[BRACKETS_KEY];
    return isBracketStyle(value) ? value : null;
}

export function cycleBracketStyle(item: WidgetItem): WidgetItem {
    const current = getBracketStyle(item);
    const next = current === null ? BRACKET_STYLES[0] : (BRACKET_STYLES[BRACKET_STYLES.indexOf(current) + 1] ?? null);
    return setMetadataValue(item, BRACKETS_KEY, next);
}

export function isLevelColorsEnabled(item: WidgetItem): boolean {
    return item.metadata?.[LEVEL_COLORS_KEY] === 'true';
}

export function setLevelColorsEnabled(item: WidgetItem, enabled: boolean): WidgetItem {
    return setMetadataValue(item, LEVEL_COLORS_KEY, enabled ? 'true' : null);
}

export function getLevelColor(item: WidgetItem, level: TranscriptThinkingEffort, colorLevel: ColorLevelString): string {
    const custom = item.metadata?.[`${LEVEL_COLOR_KEY_PREFIX}${level}`];
    if (custom) {
        return custom;
    }

    return (colorLevel === 'ansi16' ? DEFAULT_LEVEL_COLORS_ANSI16[level] : undefined) ?? DEFAULT_LEVEL_COLORS[level];
}

// A null color restores the level's default
export function setLevelColor(item: WidgetItem, level: TranscriptThinkingEffort, color: string | null): WidgetItem {
    return setMetadataValue(item, `${LEVEL_COLOR_KEY_PREFIX}${level}`, color);
}

// Accepts what people naturally type for a custom color (#ff8800, ff8800,
// 208) as well as the stored hex:/ansi256: forms; null when it isn't one
export function parseCustomColor(input: string): string | null {
    const value = input.trim();
    const hex = /^(?:hex:|#)?([0-9a-f]{6})$/i.exec(value)?.[1];
    if (hex) {
        return `hex:${hex}`;
    }

    const ansi256 = /^(?:ansi256:)?(\d{1,3})$/.exec(value)?.[1];
    if (ansi256 && Number(ansi256) <= 255) {
        return `ansi256:${ansi256}`;
    }

    return null;
}

export function getBracketColorMode(item: WidgetItem): BracketColorMode {
    return item.metadata?.[BRACKET_COLOR_KEY] === 'widget' ? 'widget' : 'effort';
}

export function setBracketColorMode(item: WidgetItem, mode: BracketColorMode): WidgetItem {
    return setMetadataValue(item, BRACKET_COLOR_KEY, mode === 'widget' ? 'widget' : null);
}

export function resetLevelColors(item: WidgetItem): WidgetItem {
    const colorKeys = Object.keys(item.metadata ?? {}).filter(key => key.startsWith(LEVEL_COLOR_KEY_PREFIX));
    return removeMetadataKeys(item, [...colorKeys, BRACKET_COLOR_KEY]);
}

export interface EffortDisplay {
    text: string;
    // null for "default" and unknown levels, which keep the widget color
    level: TranscriptThinkingEffort | null;
}

export interface EffortFormatOptions {
    colorLevel: ColorLevelString;
    colorsDisabled: boolean;
}

export function formatThinkingEffort(item: WidgetItem, effort: EffortDisplay, options: EffortFormatOptions): string {
    const label = item.rawValue ? '' : getLabel(item, THINKING_EFFORT_LABEL);
    const brackets = getBracketStyle(item);
    const open = brackets?.[0] ?? '';
    const close = brackets?.[1] ?? '';

    if (!isLevelColorsEnabled(item) || options.colorsDisabled) {
        return `${open}${label}${effort.text}${close}`;
    }

    // Only the level's runs are painted, each ending with the default-foreground
    // code; the renderer colors the label, unknown levels and widget-colored
    // brackets with the widget color (Widget.colorsOnlyItsRuns)
    const paint = (text: string, color: string | null): string => {
        const code = color ? getColorAnsiCode(color, options.colorLevel) : '';
        return text && code ? `${code}${text}\x1b[39m` : text;
    };
    const valueColor = effort.level ? getLevelColor(item, effort.level, options.colorLevel) : null;
    const bracketColor = getBracketColorMode(item) === 'effort' ? valueColor : null;

    return `${paint(open, bracketColor)}${label}${paint(effort.text, valueColor)}${paint(close, bracketColor)}`;
}
