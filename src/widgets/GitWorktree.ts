import type { RenderContext } from '../types/RenderContext';
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

export class GitWorktreeWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the current git worktree name'; }
    getDisplayName(): string { return 'Git Worktree'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoGit = item.metadata?.hideNoGit === 'true';
        const modifiers: string[] = [];

        if (hideNoGit) {
            modifiers.push('hide \'no git\'');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-nogit') {
            const currentState = item.metadata?.hideNoGit === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoGit: (!currentState).toString()
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        const hideNoGit = item.metadata?.hideNoGit === 'true';

        if (context.isPreview)
            return item.rawValue ? 'main' : '𖠰 main';

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '𖠰 no git';
        }

        const worktree = this.getGitWorktree(context);
        if (worktree)
            return item.rawValue ? worktree : `𖠰 ${worktree}`;

        return hideNoGit ? null : '𖠰 no git';
    }

    private getGitWorktree(context: RenderContext): string | null {
        const worktreeDir = runGit('rev-parse --git-dir', context);
        if (!worktreeDir) {
            return null;
        }

        const normalizedGitDir = worktreeDir.replace(/\\/g, '/');

        // /some/path/.git or .git
        if (normalizedGitDir.endsWith('/.git') || normalizedGitDir === '.git')
            return 'main';

        // /some/path/.git/worktrees/some-worktree or /some/path/.git/worktrees/some-dir/some-worktree
        const marker = '.git/worktrees/';
        const markerIndex = normalizedGitDir.lastIndexOf(marker);
        if (markerIndex === -1) {
            return null;
        }

        const worktree = normalizedGitDir.slice(markerIndex + marker.length);

        return worktree.length > 0 ? worktree : null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no git\' message', action: 'toggle-nogit' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}