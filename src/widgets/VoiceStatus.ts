import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getVoiceConfig } from '../utils/claude-settings';

const MIC_EMOJI = '🎤';
const MIC_NERD_FONT = '';
const MIC_SLASH_NERD_FONT = '';
const STATE_DOT_OFF = '○';
const STATE_DOT_ON = '◉';

const FORMATS = ['icon', 'icon-text', 'text', 'word'] as const;
type VoiceFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: VoiceFormat = 'icon';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const NERD_FONT_METADATA_KEY = 'nerdFont';

function getFormat(item: WidgetItem): VoiceFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as VoiceFormat) : DEFAULT_FORMAT;
}

function setFormat(item: WidgetItem, format: VoiceFormat): WidgetItem {
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

function formatStatus(enabled: boolean, format: VoiceFormat, nerdFont: boolean): string {
    const stateText = enabled ? 'on' : 'off';
    const stateDot = enabled ? STATE_DOT_ON : STATE_DOT_OFF;
    const icon = nerdFont
        ? (enabled ? MIC_NERD_FONT : MIC_SLASH_NERD_FONT)
        : MIC_EMOJI;

    switch (format) {
        case 'icon':
            return nerdFont ? icon : `${icon} ${stateDot}`;
        case 'icon-text':
            return `${icon} ${stateText}`;
        case 'text':
            return stateText;
        case 'word':
            return `voice ${stateText}`;
    }
}

export class VoiceStatusWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows whether Claude Code voice input is enabled'; }
    getDisplayName(): string { return 'Voice Status'; }
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

        const config = getVoiceConfig();
        if (config === null) {
            return null;
        }

        if (item.rawValue) {
            return config.enabled ? 'on' : 'off';
        }

        return formatStatus(config.enabled, format, nerdFont);
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
