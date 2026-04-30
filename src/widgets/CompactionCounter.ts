import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const COMPACTION_ICON = '↻';
const COMPACTION_NERD_FONT_ICON = '\uF021';
const FORMATS = ['icon-space-number', 'text-and-number', 'number'] as const;
type CompactionCounterFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: CompactionCounterFormat = 'icon-space-number';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_HIDE_ZERO_ACTION = 'toggle-hide-zero';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const HIDE_ZERO_METADATA_KEY = 'hideZero';
const NERD_FONT_METADATA_KEY = 'nerdFont';

function getFormat(item: WidgetItem): CompactionCounterFormat {
    const format = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(format ?? '') ? (format as CompactionCounterFormat) : DEFAULT_FORMAT;
}

function removeNerdFont(item: WidgetItem): WidgetItem {
    const { [NERD_FONT_METADATA_KEY]: removedNerdFont, ...restMetadata } = item.metadata ?? {};
    void removedNerdFont;

    return {
        ...item,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
    };
}

function setFormat(item: WidgetItem, format: CompactionCounterFormat): WidgetItem {
    if (format === DEFAULT_FORMAT) {
        const { format: removedFormat, ...restMetadata } = item.metadata ?? {};
        void removedFormat;

        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }

    const { [NERD_FONT_METADATA_KEY]: removedNerdFont, ...restMetadata } = item.metadata ?? {};
    void removedNerdFont;

    return {
        ...item,
        metadata: {
            ...restMetadata,
            format
        }
    };
}

function isNerdFontEnabled(item: WidgetItem): boolean {
    return item.metadata?.[NERD_FONT_METADATA_KEY] === 'true' && getFormat(item) === DEFAULT_FORMAT;
}

function isHideZeroEnabled(item: WidgetItem): boolean {
    return item.metadata?.[HIDE_ZERO_METADATA_KEY] === 'true';
}

function toggleHideZero(item: WidgetItem): WidgetItem {
    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            [HIDE_ZERO_METADATA_KEY]: (!isHideZeroEnabled(item)).toString()
        }
    };
}

function toggleNerdFont(item: WidgetItem): WidgetItem {
    if (getFormat(item) !== DEFAULT_FORMAT) {
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

function formatCount(count: number, format: CompactionCounterFormat, icon: string): string {
    switch (format) {
        case 'icon-space-number': return `${icon} ${count}`;
        case 'text-and-number': return `Compactions: ${count}`;
        case 'number': return String(count);
    }
}

/**
 * Displays a count of context compaction events in the current session.
 *
 * Claude Code periodically compacts (summarizes) conversation context when it
 * approaches the context window limit. This widget tracks how many times
 * compaction has occurred by detecting drops in used_percentage between renders.
 *
 * Shows ↻ N by default, including ↻ 0 before compaction occurs. Can be
 * configured to hide when count is 0.
 */
export class CompactionCounterWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Count of context compaction events in the current session.'; }
    getDisplayName(): string { return 'Compaction Counter'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [getFormat(item)];
        if (isNerdFontEnabled(item)) {
            modifiers.push('nerd font');
        }
        if (isHideZeroEnabled(item)) {
            modifiers.push('hide zero');
        }

        return {
            displayText: 'Compaction Counter',
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_FORMAT_ACTION) {
            const currentFormat = getFormat(item);
            const nextFormat = FORMATS[(FORMATS.indexOf(currentFormat) + 1) % FORMATS.length] ?? DEFAULT_FORMAT;

            return setFormat(item, nextFormat);
        }

        if (action === TOGGLE_HIDE_ZERO_ACTION) {
            return toggleHideZero(item);
        }

        if (action === TOGGLE_NERD_FONT_ACTION) {
            return toggleNerdFont(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = getFormat(item);
        const icon = isNerdFontEnabled(item) ? COMPACTION_NERD_FONT_ICON : COMPACTION_ICON;

        if (context.isPreview) {
            return formatCount(2, format, icon);
        }

        const count = context.compactionData?.count ?? 0;
        if (count === 0 && isHideZeroEnabled(item))
            return null;

        return formatCount(count, format, icon);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION }
        ];

        if (item === undefined || getFormat(item) === DEFAULT_FORMAT) {
            keybinds.push({ key: 'n', label: '(n)erd font', action: TOGGLE_NERD_FONT_ACTION });
        }

        keybinds.push({ key: 'h', label: '(h)ide when zero', action: TOGGLE_HIDE_ZERO_ACTION });

        return keybinds;
    }

    getValueType(): 'number' { return 'number'; }

    getValue(context: RenderContext, _item: WidgetItem): number | string | boolean | null {
        return context.compactionData?.count ?? 0;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
