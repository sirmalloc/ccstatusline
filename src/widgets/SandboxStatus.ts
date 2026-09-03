import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getSandboxConfig,
    resolveClaudeConfigCwd
} from '../utils/claude-settings';

import {
    isNerdFontEnabled,
    setNerdFontFormat,
    toggleNerdFont,
    type NerdFontFormats
} from './shared/metadata';

const DOT_ON = '●';
const DOT_OFF = '○';
const LOCK_NERD_FONT = '';
const UNLOCK_NERD_FONT = '';

const FORMATS = ['glyph', 'text', 'word'] as const;
type SandboxFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: SandboxFormat = 'glyph';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';

function getFormat(item: WidgetItem): SandboxFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as SandboxFormat) : DEFAULT_FORMAT;
}

function canUseNerdFont(item: WidgetItem): boolean {
    return getFormat(item) === 'glyph';
}

const NERD_FONT_FORMATS: NerdFontFormats<SandboxFormat> = {
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function formatStatus(enabled: boolean, format: SandboxFormat, nerdFont: boolean, rawValue: boolean): string {
    const stateText = enabled ? 'ON' : 'OFF';
    const glyph = nerdFont
        ? (enabled ? LOCK_NERD_FONT : UNLOCK_NERD_FONT)
        : (enabled ? DOT_ON : DOT_OFF);

    switch (format) {
        case 'glyph':
            return rawValue ? glyph : `SB: ${glyph}`;
        case 'text':
            return rawValue ? stateText : `SB: ${stateText}`;
        case 'word':
            return rawValue ? stateText : `Sandbox: ${stateText}`;
    }
}

export class SandboxStatusWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string {
        return [
            'Shows whether Claude Code bash sandbox mode is enabled',
            'Best effort: may not reflect active sandboxing when managed or CLI settings override it, or when sandbox initialization fails.'
        ].join('\n');
    }

    getDisplayName(): string { return 'Sandbox Status'; }
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

        const config = getSandboxConfig(resolveClaudeConfigCwd(context));
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
