import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getGitShortSha,
    isInsideGitWorkTree
} from '../utils/git';

import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';

export class GitShaWidget implements Widget {
    getDefaultColor(): string { return 'gray'; }
    getDescription(): string { return 'Shows short commit hash (SHA)'; }
    getDisplayName(): string { return 'Git SHA'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getHideNoGitModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleNoGitAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);

        if (context.isPreview) {
            return 'a1b2c3d';
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const sha = getGitShortSha(context);
        return sha ?? (hideNoGit ? null : '(no commit)');
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoGitKeybinds();
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}