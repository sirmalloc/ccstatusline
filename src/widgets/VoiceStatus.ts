import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getVoiceConfig,
    resolveClaudeConfigCwd
} from '../utils/claude-settings';

import {
    getFormat,
    getFormatKeybinds,
    getFormatModifierText,
    handleFormatAction,
    type FormatOptions
} from './shared/format-options';
import { isNerdFontEnabled } from './shared/metadata';

const MIC_EMOJI = '🎤';
const MIC_NERD_FONT = '';
const MIC_SLASH_NERD_FONT = '';
const STATE_DOT_OFF = '○';
const STATE_DOT_ON = '◉';

const FORMATS = ['icon', 'icon-text', 'text', 'word'] as const;
type VoiceFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: VoiceFormat = 'icon';

function canUseNerdFont(item: WidgetItem): boolean {
    const format = getFormat(item, FORMAT_OPTIONS);
    return format === 'icon' || (format === 'icon-text' && !item.rawValue);
}

const FORMAT_OPTIONS: FormatOptions<VoiceFormat> = {
    formats: FORMATS,
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function formatStatus(enabled: boolean, format: VoiceFormat, nerdFont: boolean, rawValue: boolean): string {
    const stateText = enabled ? 'on' : 'off';
    const stateDot = enabled ? STATE_DOT_ON : STATE_DOT_OFF;
    const icon = nerdFont
        ? (enabled ? MIC_NERD_FONT : MIC_SLASH_NERD_FONT)
        : MIC_EMOJI;

    switch (format) {
        case 'icon':
            return nerdFont ? icon : (rawValue ? stateDot : `${icon} ${stateDot}`);
        case 'icon-text':
            return rawValue ? stateText : `${icon} ${stateText}`;
        case 'text':
            return stateText;
        case 'word':
            return rawValue ? stateText : `voice ${stateText}`;
    }
}

export class VoiceStatusWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows whether Claude Code voice input is enabled'; }
    getDisplayName(): string { return 'Voice Status'; }
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
        const nerdFont = isNerdFontEnabled(item, FORMAT_OPTIONS);

        if (context.isPreview) {
            return formatStatus(true, format, nerdFont, item.rawValue ?? false);
        }

        const config = getVoiceConfig(resolveClaudeConfigCwd(context));
        if (config === null) {
            return null;
        }

        return formatStatus(config.enabled, format, nerdFont, item.rawValue ?? false);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getFormatKeybinds(item, FORMAT_OPTIONS);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
