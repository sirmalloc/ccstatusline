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
    isNerdFontEnabled,
    setNerdFontFormat,
    toggleNerdFont,
    type NerdFontFormats
} from './shared/metadata';

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

function getFormat(item: WidgetItem): VoiceFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as VoiceFormat) : DEFAULT_FORMAT;
}

function canUseNerdFont(item: WidgetItem): boolean {
    const format = getFormat(item);
    return format === 'icon' || (format === 'icon-text' && !item.rawValue);
}

const NERD_FONT_FORMATS: NerdFontFormats<VoiceFormat> = {
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
        const modifiers: string[] = [getFormat(item)];
        if (isNerdFontEnabled(item, NERD_FONT_FORMATS)) {
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

            return setNerdFontFormat(item, nextFormat, NERD_FONT_FORMATS);
        }

        if (action === TOGGLE_NERD_FONT_ACTION) {
            return toggleNerdFont(item, NERD_FONT_FORMATS);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const format = getFormat(item);
        const nerdFont = isNerdFontEnabled(item, NERD_FONT_FORMATS);

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
        const keybinds: CustomKeybind[] = [
            { key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION }
        ];
        if (item === undefined || canUseNerdFont(item)) {
            keybinds.push({ key: 'n', label: '(n)erd font', action: TOGGLE_NERD_FONT_ACTION });
        }
        return keybinds;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
