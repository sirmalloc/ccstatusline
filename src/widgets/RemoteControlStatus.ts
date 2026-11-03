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
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    getSlotSymbol,
    getSymbolKeybind,
    joinSymbol,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const SATELLITE_EMOJI = '📡';
const SATELLITE_NERD_FONT = '';
// nf-md-wifi_off. Nerd Fonts v3 moved the Material Design icons out of the
// BMP; the v2 codepoint this used to be (U+F6AC) is unassigned in v3 fonts.
const SATELLITE_SLASH_NERD_FONT = '\u{f05aa}';

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
const LABEL = 'remote ';

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
    // These built-in icons can draw across two cells despite reporting width one.
    // Custom glyphs keep their normal gap, since their drawn width is font-dependent.
    const minimumIconWidth = nerdFont && (icon === SATELLITE_NERD_FONT || icon === SATELLITE_SLASH_NERD_FONT) ? 2 : 0;

    switch (format) {
        case 'icon':
            return nerdFont ? icon : (rawValue ? stateDot : `${icon} ${stateDot}`);
        case 'icon-text':
            return rawValue ? stateText : joinSymbol(icon, stateText, minimumIconWidth);
        case 'text':
            return stateText;
        case 'word':
            return rawValue ? stateText : `remote ${stateText}`;
        case 'label-check':
            return formatRawOrLabeledValue(item, LABEL, enabled ? CHECK_EMOJI : CROSS_EMOJI);
        case 'label-mark':
            return formatRawOrLabeledValue(item, LABEL, enabled ? CHECK_MARK : CROSS_MARK);
    }
}

export class RemoteControlStatusWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows whether Claude Code remote control is attached to the current session'; }
    getDisplayName(): string { return 'Remote Control Status'; }
    getCategory(): string { return 'Core'; }

    getLabelPrefix(item: WidgetItem): string | undefined {
        const format = getFormat(item, FORMAT_OPTIONS);
        return format === 'label-check' || format === 'label-mark' ? LABEL : undefined;
    }

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

        const text = formatStatus(item, status.enabled);
        return text.length > 0 ? text : null;
    }

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
