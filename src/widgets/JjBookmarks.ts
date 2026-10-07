import type { RenderContext } from '../types/RenderContext';
import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { runJjArgs } from '../utils/jj';

import { JjWidgetBase } from './shared/jj-widget-base';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '🔖';

export class JjBookmarksWidget extends JjWidgetBase {
    protected readonly previewValue = 'main';
    protected readonly noJjText = 'no jj';
    protected override readonly emptyText = '(none)';

    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current jujutsu bookmark(s)'; }
    getDisplayName(): string { return 'JJ Bookmarks'; }

    protected getValue(context: RenderContext): string | null {
        const output = runJjArgs([
            'log',
            '--no-graph',
            '-r',
            'heads(::@ & bookmarks())',
            '--template',
            'bookmarks'
        ], context);
        if (!output) {
            return null;
        }

        const bookmarks = output.split(/\s+/).filter(Boolean);
        if (bookmarks.length === 0) {
            return null;
        }

        return bookmarks.join(', ');
    }

    protected formatValue(item: WidgetItem, bookmarks: string): string {
        return formatRawOrLabeledValue(item, formatSymbolPrefix(item, DEFAULT_SYMBOL), bookmarks);
    }

    protected override formatPlaceholder(item: WidgetItem, text: string): string {
        return `${formatSymbolPrefix(item, DEFAULT_SYMBOL)}${text}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
}
