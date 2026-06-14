import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    isInsideJjRepo,
    runJjArgs
} from '../utils/jj';

import {
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '🔖';

export class JjBookmarksWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current jujutsu bookmark(s)'; }
    getDisplayName(): string { return 'JJ Bookmarks'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoJj = item.metadata?.hideNoJj === 'true';
        const modifiers: string[] = [];

        if (hideNoJj) {
            modifiers.push('hide \'no jj\'');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-nojj') {
            const currentState = item.metadata?.hideNoJj === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoJj: (!currentState).toString()
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = item.metadata?.hideNoJj === 'true';
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview) {
            return item.rawValue ? 'main' : `${prefix}main`;
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : `${prefix}no jj`;
        }

        const bookmarks = this.getJjBookmarks(context);
        if (bookmarks) {
            return item.rawValue ? bookmarks : `${prefix}${bookmarks}`;
        }

        return hideNoJj ? null : `${prefix}(none)`;
    }

    private getJjBookmarks(context: RenderContext): string | null {
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

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no jj\' message', action: 'toggle-nojj' },
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
