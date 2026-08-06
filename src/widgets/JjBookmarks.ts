import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
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
    NO_JJ_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
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
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_JJ_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = isHidden(item, NO_JJ_HIDEABLE_STATE.key);
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
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
