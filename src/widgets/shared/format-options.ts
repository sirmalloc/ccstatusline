import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import {
    isNerdFontEnabled,
    setNerdFontFormat,
    toggleNerdFont,
    type NerdFontFormats
} from './metadata';

export const CYCLE_FORMAT_ACTION = 'cycle-format';
export const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';

// A widget's display formats, cycled with (f), and which of them can show a
// Nerd Font icon, toggled with (n)
export interface FormatOptions<TFormat extends string> extends NerdFontFormats<TFormat> { formats: readonly TFormat[] }

export function getFormat<TFormat extends string>(item: WidgetItem, options: FormatOptions<TFormat>): TFormat {
    const format = item.metadata?.format;
    return (options.formats as readonly string[]).includes(format ?? '') ? (format as TFormat) : options.defaultFormat;
}

// The line editor's modifier, e.g. "(icon, nerd font)"
export function getFormatModifierText<TFormat extends string>(item: WidgetItem, options: FormatOptions<TFormat>): string {
    const modifiers: string[] = [getFormat(item, options)];
    if (isNerdFontEnabled(item, options)) {
        modifiers.push('nerd font');
    }
    return `(${modifiers.join(', ')})`;
}

export function handleFormatAction<TFormat extends string>(action: string, item: WidgetItem, options: FormatOptions<TFormat>): WidgetItem | null {
    if (action === CYCLE_FORMAT_ACTION) {
        const currentFormat = getFormat(item, options);
        const nextFormat = options.formats[(options.formats.indexOf(currentFormat) + 1) % options.formats.length] ?? options.defaultFormat;
        return setNerdFontFormat(item, nextFormat, options);
    }

    if (action === TOGGLE_NERD_FONT_ACTION) {
        return toggleNerdFont(item, options);
    }

    return null;
}

export function getFormatKeybinds<TFormat extends string>(item: WidgetItem | undefined, options: FormatOptions<TFormat>): CustomKeybind[] {
    const keybinds: CustomKeybind[] = [
        { key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION }
    ];
    if (item === undefined || options.canUseNerdFont(item)) {
        keybinds.push({ key: 'n', label: '(n)erd font', action: TOGGLE_NERD_FONT_ACTION });
    }
    return keybinds;
}
