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

export class GitRootDirWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the git repository root directory name'; }
    getDisplayName(): string { return 'Git Root Dir'; }
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

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);

        if (context.isPreview) {
            return 'my-repo';
        }

        if (isHideWhenJjEnabled(item) && isInsideJjWorkspace(context)) {
            return null;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : 'no git';
        }

        const rootDir = this.getGitRootDir(context);
        if (rootDir) {
            return this.getRootDirName(rootDir);
        }

        return hideNoGit ? null : 'no git';
    }

    private getGitRootDir(context: RenderContext): string | null {
        return runGit('rev-parse --show-toplevel', context);
    }

    private getRootDirName(rootDir: string): string {
        const trimmedRootDir = rootDir.replace(/[\\/]+$/, '');
        const normalizedRootDir = trimmedRootDir.length > 0 ? trimmedRootDir : rootDir;
        const parts = normalizedRootDir.split(/[\\/]/).filter(Boolean);
        const lastPart = parts[parts.length - 1];
        return lastPart && lastPart.length > 0 ? lastPart : normalizedRootDir;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [...getHideNoGitKeybinds(), ...getHideWhenJjKeybinds()];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}