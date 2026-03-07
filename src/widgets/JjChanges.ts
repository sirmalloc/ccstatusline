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

export class JjChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows jj changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'JJ Changes'; }
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
            return '(+42,-10)';
        }

        if (!isInsideJjWorkspace(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = getJjChangeCounts(context);
        return `(+${changes.insertions},-${changes.deletions})`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoJjKeybinds();
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}