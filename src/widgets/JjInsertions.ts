import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getJjChangeCounts,
    isInsideJjWorkspace
} from '../utils/jj';

import {
    getHideNoJjKeybinds,
    getHideNoJjModifierText,
    handleToggleNoJjAction,
    isHideNoJjEnabled
} from './shared/jj-no-jj';

export class JjInsertionsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows jj insertions count'; }
    getDisplayName(): string { return 'JJ Insertions'; }
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

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = isHideNoJjEnabled(item);

        if (context.isPreview) {
            return '+42';
        }

        if (!isInsideJjWorkspace(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = getJjChangeCounts(context);
        return `+${changes.insertions}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoJjKeybinds();
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}