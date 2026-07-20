import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getSandboxConfig } from '../utils/claude-settings';

const DOT_ON = '●';
const DOT_OFF = '○';
const LOCK_NERD_FONT = '';
const UNLOCK_NERD_FONT = '';

const FORMATS = ['glyph', 'text', 'word', 'bare'] as const;
type SandboxFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: SandboxFormat = 'glyph';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const NERD_FONT_METADATA_KEY = 'nerdFont';

function getFormat(item: WidgetItem): SandboxFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as SandboxFormat) : DEFAULT_FORMAT;
}

function setFormat(item: WidgetItem, format: SandboxFormat): WidgetItem {
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

function formatStatus(enabled: boolean, format: SandboxFormat, nerdFont: boolean): string {
    const stateText = enabled ? 'ON' : 'OFF';
    const glyph = nerdFont
        ? (enabled ? LOCK_NERD_FONT : UNLOCK_NERD_FONT)
        : (enabled ? DOT_ON : DOT_OFF);

    switch (format) {
        case 'glyph':
            return `SB: ${glyph}`;
        case 'text':
            return `SB: ${stateText}`;
        case 'word':
            return `Sandbox: ${stateText}`;
        case 'bare':
            return glyph;
    }
}

function resolveSandboxConfigCwd(context: RenderContext): string | undefined {
    const candidates = [
        context.data?.workspace?.project_dir,
        context.data?.cwd,
        context.data?.workspace?.current_dir
    ];

    return candidates.find(candidate => typeof candidate === 'string' && candidate.trim().length > 0);
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

        const config = getSandboxConfig(resolveSandboxConfigCwd(context));
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
