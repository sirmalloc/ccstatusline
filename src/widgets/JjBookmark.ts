import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideJjWorkspace,
    runJjRaw
} from '../utils/jj';

import {
    getHideNoJjKeybinds,
    getHideNoJjModifierText,
    handleToggleNoJjAction,
    isHideNoJjEnabled
} from './shared/jj-no-jj';

export class JjBookmarkWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the current jj bookmark name(s)'; }
    getDisplayName(): string { return 'JJ Bookmark'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getHideNoJjModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleNoJjAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const hideNoJj = isHideNoJjEnabled(item);

        if (context.isPreview) {
            return item.rawValue ? 'main' : '@ main';
        }

        if (!isInsideJjWorkspace(context)) {
            return hideNoJj ? null : '@ no jj';
        }

        const bookmarks = runJjRaw('log --no-graph -r @ -T \'bookmarks.join(",")\'', context);
        if (bookmarks === null) {
            return hideNoJj ? null : '@ no jj';
        }

        if (bookmarks.length > 0)
            return item.rawValue ? bookmarks : `@ ${bookmarks}`;

        return item.rawValue ? '(none)' : '@ (none)';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoJjKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}