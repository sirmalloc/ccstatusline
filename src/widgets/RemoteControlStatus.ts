import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getRemoteControlStatus } from '../utils/claude-settings';

const SATELLITE_EMOJI = '📡';
const SATELLITE_NERD_FONT = '';
const SATELLITE_SLASH_NERD_FONT = '';
const STATE_DOT_OFF = '○';
const STATE_DOT_ON = '◉';

const FORMATS = ['icon', 'icon-text', 'text', 'word', 'label-check'] as const;
const CHECK_EMOJI = '✅';
const CROSS_EMOJI = '❌';
type RemoteFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: RemoteFormat = 'icon';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const NERD_FONT_METADATA_KEY = 'nerdFont';

function getFormat(item: WidgetItem): RemoteFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as RemoteFormat) : DEFAULT_FORMAT;
}

function setFormat(item: WidgetItem, format: RemoteFormat): WidgetItem {
    if (format === DEFAULT_FORMAT) {
        const { format: removedFormat, ...restMetadata } = item.metadata ?? {};
        void removedFormat;

        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }

    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            format
        }
    };
}

function isNerdFontEnabled(item: WidgetItem): boolean {
    return item.metadata?.[NERD_FONT_METADATA_KEY] === 'true';
}

function toggleNerdFont(item: WidgetItem): WidgetItem {
    if (!isNerdFontEnabled(item)) {
        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                [NERD_FONT_METADATA_KEY]: 'true'
            }
        };
    }

    const { [NERD_FONT_METADATA_KEY]: removedNerdFont, ...restMetadata } = item.metadata ?? {};
    void removedNerdFont;

    return {
        ...item,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
    };
}

function formatStatus(enabled: boolean, format: RemoteFormat, nerdFont: boolean): string {
    const stateText = enabled ? 'on' : 'off';
    const stateDot = enabled ? STATE_DOT_ON : STATE_DOT_OFF;
    const icon = nerdFont
        ? (enabled ? SATELLITE_NERD_FONT : SATELLITE_SLASH_NERD_FONT)
        : SATELLITE_EMOJI;

    switch (format) {
        case 'icon':
            return nerdFont ? icon : `${icon} ${stateDot}`;
        case 'icon-text':
            return `${icon} ${stateText}`;
        case 'text':
            return stateText;
        case 'word':
            return `remote ${stateText}`;
        case 'label-check':
            return `remote ${enabled ? CHECK_EMOJI : CROSS_EMOJI}`;
    }
}

export class RemoteControlStatusWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows whether Claude Code remote control is attached to the current session'; }
    getDisplayName(): string { return 'Remote Control Status'; }
    getCategory(): string { return 'Core'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [getFormat(item)];
        if (isNerdFontEnabled(item)) {
            modifiers.push('nerd font');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_FORMAT_ACTION) {
            const currentFormat = getFormat(item);
            const nextFormat = FORMATS[(FORMATS.indexOf(currentFormat) + 1) % FORMATS.length] ?? DEFAULT_FORMAT;

            return setFormat(item, nextFormat);
        }

        if (action === TOGGLE_NERD_FONT_ACTION) {
            return toggleNerdFont(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const format = getFormat(item);
        const nerdFont = isNerdFontEnabled(item);

        if (context.isPreview) {
            if (item.rawValue) {
                return 'on';
            }
            return formatStatus(true, format, nerdFont);
        }

        const status = getRemoteControlStatus(context.data?.session_id);
        if (status === null) {
            return null;
        }

        if (item.rawValue) {
            return status.enabled ? 'on' : 'off';
        }

        return formatStatus(status.enabled, format, nerdFont);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION },
            { key: 'n', label: '(n)erd font', action: TOGGLE_NERD_FONT_ACTION }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
