import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    isInsideGitWorkTree,
    runGit
} from '../utils/git';

import { shouldHideGitWidgetForJj } from './shared/git-jj-precedence';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';
import {
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '𖠰';

export class GitWorktreeWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the current git worktree name'; }
    getDisplayName(): string { return 'Git Worktree'; }
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

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview)
            return item.rawValue ? 'main' : `${prefix}main`;

        if (shouldHideGitWidgetForJj('git-worktree', context, settings)) {
            return null;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : `${prefix}no git`;
        }

        const worktree = this.getGitWorktree(context);
        if (worktree)
            return item.rawValue ? worktree : `${prefix}${worktree}`;

        return hideNoGit ? null : `${prefix}no git`;
    }

    private getGitWorktree(context: RenderContext): string | null {
        const worktreeDir = runGit('rev-parse --git-dir', context);
        if (!worktreeDir)
            return null;

        const normalizedGitDir = worktreeDir.replace(/\\/g, '/');

        // /some/path/.git or .git (main worktree of regular repo)
        if (normalizedGitDir.endsWith('/.git') || normalizedGitDir === '.git')
            return 'main';

        // /some/path/.git/worktrees/some-worktree or /some/path/.git/worktrees/some-dir/some-worktree
        const repoMarker = '.git/worktrees/';
        const repoMarkerIndex = normalizedGitDir.lastIndexOf(repoMarker);
        if (repoMarkerIndex !== -1) {
            const worktree = normalizedGitDir.slice(repoMarkerIndex + repoMarker.length);
            return worktree.length > 0 ? worktree : null;
        }

        // /some/path/worktrees/some-worktree or /some/path/worktrees/some-dir/some-worktree
        const bareMarker = '/worktrees/';
        const bareMarkerIndex = normalizedGitDir.lastIndexOf(bareMarker);
        if (bareMarkerIndex === -1)
            return null;

        const worktree = normalizedGitDir.slice(bareMarkerIndex + bareMarker.length);
        return worktree.length > 0 ? worktree : null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            ...getHideNoGitKeybinds(),
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
