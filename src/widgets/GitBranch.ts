import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideGitWorkTree,
    runGit
} from '../utils/git';
import { isInsideJjWorkspace } from '../utils/jj';

import { makeModifierText } from './shared/editor-display';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifiers,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';
import {
    getHideWhenJjKeybinds,
    getHideWhenJjModifierText,
    handleToggleHideWhenJjAction,
    isHideWhenJjEnabled
} from './shared/git-hide-when-jj';

export class GitBranchWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current git branch name'; }
    getDisplayName(): string { return 'Git Branch'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText([...getHideNoGitModifiers(item), ...getHideWhenJjModifierText(item)])
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleNoGitAction(action, item) ?? handleToggleHideWhenJjAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);

        if (context.isPreview) {
            return item.rawValue ? 'main' : '⎇ main';
        }

        if (isHideWhenJjEnabled(item) && isInsideJjWorkspace(context)) {
            return null;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '⎇ no git';
        }

        const branch = this.getGitBranch(context);
        if (branch)
            return item.rawValue ? branch : `⎇ ${branch}`;

        return hideNoGit ? null : '⎇ no git';
    }

    private getGitBranch(context: RenderContext): string | null {
        return runGit('branch --show-current', context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [...getHideNoGitKeybinds(), ...getHideWhenJjKeybinds()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}