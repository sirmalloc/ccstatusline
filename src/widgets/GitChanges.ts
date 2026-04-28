import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getGitChangeCounts,
    isInsideGitWorkTree
} from '../utils/git';
import { isInsideJjRepo } from '../utils/jj';

import { makeModifierText } from './shared/editor-display';
import {
    getHideWhenJjKeybinds,
    getHideWhenJjModifiers,
    handleToggleHideWhenJjAction,
    isHideWhenJjEnabled
} from './shared/git-hide-when-jj';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifiers,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';

export class GitChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows git changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'Git Changes'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText([...getHideNoGitModifiers(item), ...getHideWhenJjModifiers(item)])
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleNoGitAction(action, item) ?? handleToggleHideWhenJjAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);

        if (context.isPreview) {
            return '(+42,-10)';
        }

        if (isHideWhenJjEnabled(item) && isInsideJjRepo(context)) {
            return null;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const changes = getGitChangeCounts(context);
        return `(+${changes.insertions},-${changes.deletions})`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [...getHideNoGitKeybinds(), ...getHideWhenJjKeybinds()];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
