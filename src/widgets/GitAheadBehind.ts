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

import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';

interface AheadBehindCounts {
    ahead: number;
    behind: number;
}

export class GitAheadBehindWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows commits ahead/behind upstream'; }
    getDisplayName(): string { return 'Git Ahead Behind'; }
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
            return item.rawValue ? '2 1' : '↑2 ↓1';
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const counts = this.getAheadBehindCounts(context);
        if (!counts) {
            return hideNoGit ? null : '(no upstream)';
        }

        return item.rawValue
            ? `${counts.ahead} ${counts.behind}`
            : `↑${counts.ahead} ↓${counts.behind}`;
    }

    private getAheadBehindCounts(context: RenderContext): AheadBehindCounts | null {
        const output = runGit('rev-list --left-right --count HEAD...@{upstream}', context);
        if (!output) {
            return null;
        }

        const [aheadRaw, behindRaw] = output.split(/\s+/);
        if (!aheadRaw || !behindRaw) {
            return null;
        }

        const ahead = parseInt(aheadRaw, 10);
        const behind = parseInt(behindRaw, 10);
        if (Number.isNaN(ahead) || Number.isNaN(behind)) {
            return null;
        }

        return {
            ahead,
            behind
        };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoGitKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}