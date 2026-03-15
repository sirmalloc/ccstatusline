import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const VIM_ICON = '\uE62B';

const FORMATS = ['icon-dash-letter', 'icon-letter', 'icon', 'letter', 'word'] as const;
type VimFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: VimFormat = 'icon-dash-letter';

function getFormat(item: WidgetItem): VimFormat {
    const f = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(f ?? '') ? (f as VimFormat) : DEFAULT_FORMAT;
}

function formatMode(mode: string, format: VimFormat): string {
    const letter = mode === 'NORMAL' ? 'N' : mode === 'INSERT' ? 'I' : (mode[0] ?? mode);
    switch (format) {
        case 'icon-dash-letter': return `${VIM_ICON}-${letter}`;
        case 'icon-letter': return `${VIM_ICON} ${letter}`;
        case 'icon': return VIM_ICON;
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
        return {
            displayText: this.getDisplayName(),
            modifierText: getFormat(item)
        };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const format = getFormat(item);

        if (context.isPreview)
            return formatMode('NORMAL', format);

        const mode = context.data?.vim?.mode;
        if (mode === undefined)
            return null;

        return formatMode(mode, format);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}