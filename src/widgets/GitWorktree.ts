import type { RenderContext } from '../types/RenderContext';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    isInsideGitWorkTree,
    runGit
} from '../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
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
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview)
            return item.rawValue ? 'main' : `${prefix}main`;

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : `${prefix}no git`;
        }

        const worktree = this.getGitWorktree(context);
        if (worktree)
            return item.rawValue ? worktree : `${prefix}${worktree}`;

        return hideNoGit ? null : `${prefix}no git`;
    }

    private getGitWorktree(context: RenderContext): string | null {
        const output = runGit('rev-parse --git-dir --git-common-dir', context);
        const [gitDir, commonDir] = (output ?? '')
            .split('\n')
            .map(dir => dir.trim().replace(/\\/g, '/'));
        if (!gitDir)
            return null;

        // A linked worktree's git dir is <common dir>/worktrees/<name>, where the
        // common dir is the main repo's (.git, or the bare repo itself)
        const linkedPrefix = `${commonDir}/worktrees/`;
        if (commonDir && gitDir.startsWith(linkedPrefix)) {
            const worktree = gitDir.slice(linkedPrefix.length);
            return worktree.length > 0 ? worktree : null;
        }

        // Any other git dir is the main worktree's: .git, a submodule's
        // .git/modules/<name>, or a --separate-git-dir path
        return 'main';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
