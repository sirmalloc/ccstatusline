import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
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
import { isHidden } from './shared/hideable';
import { isNerdFontEnabled } from './shared/metadata';

const BOLT_EMOJI = '⚡';
const FLASH_NERD_FONT = '󰉁'; // nf-md-flash (U+F0241)
const FLASH_OFF_NERD_FONT = '󰉃'; // nf-md-flash_off (U+F0243)
const STATE_DOT_OFF = '○';
const STATE_DOT_ON = '◉';

const FORMATS = ['icon-text', 'icon', 'text', 'word'] as const;
type FastModeFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: FastModeFormat = 'icon-text';

const OFF_HIDEABLE_STATE: HideableState = { key: 'off', label: 'when fast mode is off' };

function canUseNerdFont(item: WidgetItem): boolean {
    const format = getFormat(item, FORMAT_OPTIONS);
    return format === 'icon' || (format === 'icon-text' && !item.rawValue);
}

const FORMAT_OPTIONS: FormatOptions<FastModeFormat> = {
    formats: FORMATS,
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function getIcon(enabled: boolean, nerdFont: boolean): string {
    if (!nerdFont) {
        return BOLT_EMOJI;
    }
    return enabled ? FLASH_NERD_FONT : FLASH_OFF_NERD_FONT;
}

function formatStatus(enabled: boolean, format: FastModeFormat, nerdFont: boolean, rawValue: boolean): string {
    const stateText = enabled ? 'on' : 'off';
    const stateDot = enabled ? STATE_DOT_ON : STATE_DOT_OFF;
    const icon = getIcon(enabled, nerdFont);

    switch (format) {
        case 'icon-text':
            return rawValue ? stateText : `${icon} ${stateText}`;
        case 'icon':
            if (nerdFont) {
                return icon;
            }
            return rawValue ? stateDot : `${icon} ${stateDot}`;
        case 'text':
            return stateText;
        case 'word':
            return rawValue ? stateText : `fast ${stateText}`;
    }
}

export class FastModeWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows whether Claude Code fast mode is on'; }
    getDisplayName(): string { return 'Fast Mode'; }
    getCategory(): string { return 'Core'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getFormatModifierText(item, FORMAT_OPTIONS)
        };
    }

    getHideableStates(): HideableState[] {
        return [OFF_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleFormatAction(action, item, FORMAT_OPTIONS);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const format = getFormat(item, FORMAT_OPTIONS);
        const nerdFont = isNerdFontEnabled(item, FORMAT_OPTIONS);

        if (context.isPreview) {
            return formatStatus(true, format, nerdFont, item.rawValue ?? false);
        }

        // Absent before Claude Code reported it
        const enabled = context.data?.fast_mode;
        if (typeof enabled !== 'boolean') {
            return null;
        }
        if (!enabled && isHidden(item, OFF_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatStatus(enabled, format, nerdFont, item.rawValue ?? false);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getFormatKeybinds(item, FORMAT_OPTIONS);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
