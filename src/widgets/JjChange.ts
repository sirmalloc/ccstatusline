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
    runJj
} from '../utils/jj';

import {
    getHideNoJjKeybinds,
    getHideNoJjModifierText,
    handleToggleNoJjAction,
    isHideNoJjEnabled
} from './shared/jj-no-jj';

export class JjChangeWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current jj change ID'; }
    getDisplayName(): string { return 'JJ Change'; }
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
            return item.rawValue ? 'kpqxywon' : 'jj: kpqxywon';
        }

        if (!isInsideJjWorkspace(context)) {
            return hideNoJj ? null : 'jj: no jj';
        }

        const changeId = runJj('log --no-graph -r @ -T \'change_id.short()\'', context);
        if (changeId)
            return item.rawValue ? changeId : `jj: ${changeId}`;

        return hideNoJj ? null : 'jj: no jj';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoJjKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}