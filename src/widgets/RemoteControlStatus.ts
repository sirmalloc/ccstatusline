import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { getRemoteControlStatus } from '../utils/claude-settings';

import {
    getFormat,
    getFormatKeybinds,
    getFormatModifierText,
    handleFormatAction,
    type FormatOptions
} from './shared/format-options';
import { isNerdFontEnabled } from './shared/metadata';
import {
    getSlotSymbol,
    getSymbolKeybind,
    joinSymbol,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const SATELLITE_EMOJI = '📡';
const SATELLITE_NERD_FONT = '';
const SATELLITE_SLASH_NERD_FONT = '';

// The Nerd Font icons differ per state, so each gets an editable slot: fonts
// and tastes vary (e.g. a matching nf-md-wifi / nf-md-wifi_off pair).
const ON_SLOT: SymbolSlot = { id: 'symbolOn', label: 'On', defaultSymbol: SATELLITE_NERD_FONT };
const OFF_SLOT: SymbolSlot = { id: 'symbolOff', label: 'Off', defaultSymbol: SATELLITE_SLASH_NERD_FONT };
const SYMBOL_SLOTS: SymbolSlot[] = [ON_SLOT, OFF_SLOT];

const STATE_DOT_OFF = '○';
const STATE_DOT_ON = '◉';

const FORMATS = ['icon', 'icon-text', 'text', 'word', 'label-check', 'label-mark'] as const;
const CHECK_EMOJI = '✅';
const CROSS_EMOJI = '❌';
const CHECK_MARK = '✓';
const CROSS_MARK = '✗';
type RemoteFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: RemoteFormat = 'icon';

function canUseNerdFont(item: WidgetItem): boolean {
    const format = getFormat(item, FORMAT_OPTIONS);
    return format === 'icon' || (format === 'icon-text' && !item.rawValue);
}

const FORMAT_OPTIONS: FormatOptions<RemoteFormat> = {
    formats: FORMATS,
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function formatStatus(item: WidgetItem, enabled: boolean): string {
    const format = getFormat(item, FORMAT_OPTIONS);
    const nerdFont = isNerdFontEnabled(item, FORMAT_OPTIONS);
    const rawValue = item.rawValue ?? false;
    const stateText = enabled ? 'on' : 'off';
    const stateDot = enabled ? STATE_DOT_ON : STATE_DOT_OFF;
    const icon = nerdFont
        ? getSlotSymbol(item, enabled ? ON_SLOT : OFF_SLOT)
        : SATELLITE_EMOJI;

    switch (format) {
        case 'icon':
            return nerdFont ? icon : (rawValue ? stateDot : `${icon} ${stateDot}`);
        case 'icon-text':
            return rawValue ? stateText : joinSymbol(icon, stateText);
        case 'text':
            return stateText;
        case 'word':
            return rawValue ? stateText : `remote ${stateText}`;
        case 'label-check':
            return rawValue ? (enabled ? CHECK_EMOJI : CROSS_EMOJI) : `remote ${enabled ? CHECK_EMOJI : CROSS_EMOJI}`;
        case 'label-mark':
            return rawValue ? (enabled ? CHECK_MARK : CROSS_MARK) : `remote ${enabled ? CHECK_MARK : CROSS_MARK}`;
    }
}

export class RemoteControlStatusWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows whether Claude Code remote control is attached to the current session'; }
    getDisplayName(): string { return 'Remote Control Status'; }
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
        if (context.isPreview) {
            return formatStatus(item, true);
        }

        const status = getRemoteControlStatus(context.data?.session_id);
        if (status === null) {
            return null;
        }

        // A blanked glyph in icon format leaves nothing to show: hide the
        // widget instead of rendering an empty segment between separators.
        const text = formatStatus(item, status.enabled);
        return text.length > 0 ? text : null;
    }

    // The glyph keybind is offered only while the Nerd Font icons are on
    // screen, since the slots replace exactly those icons.
    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds = getFormatKeybinds(item, FORMAT_OPTIONS);
        if (item && isNerdFontEnabled(item, FORMAT_OPTIONS)) {
            return [...keybinds, getSymbolKeybind()];
        }
        return keybinds;
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, SYMBOL_SLOTS);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
