import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import {
    getFormat,
    getFormatKeybinds,
    getFormatModifierText,
    handleFormatAction,
    type FormatOptions
} from './shared/format-options';
import { isNerdFontEnabled } from './shared/metadata';

const VIM_ICON = 'v';
const VIM_NERD_FONT_ICON = '\uE62B';

const FORMATS = ['icon-dash-letter', 'icon-letter', 'icon', 'letter', 'word'] as const;
type VimFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: VimFormat = 'icon-dash-letter';

function canUseNerdFont(item: WidgetItem): boolean {
    const format = getFormat(item, FORMAT_OPTIONS);
    return format === 'icon-dash-letter' || format === 'icon-letter' || format === 'icon';
}

const FORMAT_OPTIONS: FormatOptions<VimFormat> = {
    formats: FORMATS,
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function formatMode(mode: string, format: VimFormat, icon: string): string {
    const letter = mode === 'NORMAL' ? 'N' : mode === 'INSERT' ? 'I' : (mode[0] ?? mode);
    switch (format) {
        case 'icon-dash-letter': return `${icon}-${letter}`;
        case 'icon-letter': return `${icon} ${letter}`;
        case 'icon': return icon;
        case 'letter': return letter;
        case 'word': return mode;
    }
}

export class VimModeWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Displays current vim editor mode'; }
    getDisplayName(): string { return 'Vim Mode'; }
    getCategory(): string { return 'Core'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getFormatModifierText(item, FORMAT_OPTIONS)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleFormatAction(action, item, FORMAT_OPTIONS);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const format = getFormat(item, FORMAT_OPTIONS);
        const icon = isNerdFontEnabled(item, FORMAT_OPTIONS) ? VIM_NERD_FONT_ICON : VIM_ICON;

        if (context.isPreview)
            return formatMode('NORMAL', format, icon);

        const mode = context.data?.vim?.mode;
        if (mode === undefined)
            return null;

        return formatMode(mode, format, icon);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getFormatKeybinds(item, FORMAT_OPTIONS);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
