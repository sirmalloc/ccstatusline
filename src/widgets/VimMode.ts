import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const VIM_ICON = 'v';
const VIM_NERD_FONT_ICON = '\uE62B';

const FORMATS = ['icon-dash-letter', 'icon-letter', 'icon', 'letter', 'word'] as const;
type VimFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: VimFormat = 'icon-dash-letter';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const NERD_FONT_METADATA_KEY = 'nerdFont';

function getFormat(item: WidgetItem): VimFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as VimFormat) : DEFAULT_FORMAT;
}

function canUseNerdFont(item: WidgetItem): boolean {
    const format = getFormat(item);
    return format === 'icon-dash-letter' || format === 'icon-letter' || format === 'icon';
}

function removeNerdFont(item: WidgetItem): WidgetItem {
    const { [NERD_FONT_METADATA_KEY]: removedNerdFont, ...restMetadata } = item.metadata ?? {};
    void removedNerdFont;

    return {
        ...item,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
    };
}

function setFormat(item: WidgetItem, format: VimFormat): WidgetItem {
    let updatedItem: WidgetItem;

    if (format === DEFAULT_FORMAT) {
        const { format: removedFormat, ...restMetadata } = item.metadata ?? {};
        void removedFormat;

        updatedItem = {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    } else {
        updatedItem = {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                format
            }
        };
    }

    return canUseNerdFont(updatedItem) ? updatedItem : removeNerdFont(updatedItem);
}

function isNerdFontEnabled(item: WidgetItem): boolean {
    return canUseNerdFont(item) && item.metadata?.[NERD_FONT_METADATA_KEY] === 'true';
}

function toggleNerdFont(item: WidgetItem): WidgetItem {
    if (!canUseNerdFont(item)) {
        return removeNerdFont(item);
    }

    if (!isNerdFontEnabled(item)) {
        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                [NERD_FONT_METADATA_KEY]: 'true'
            }
        };
    }

    return removeNerdFont(item);
}

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
        const icon = isNerdFontEnabled(item) ? VIM_NERD_FONT_ICON : VIM_ICON;

        if (context.isPreview)
            return formatMode('NORMAL', format, icon);

        const mode = context.data?.vim?.mode;
        if (mode === undefined)
            return null;

        return formatMode(mode, format, icon);
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

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
