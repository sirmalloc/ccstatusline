import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class GitWorktreeWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the current git worktree name'; }
    getDisplayName(): string { return 'Git Worktree'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'main' : '𖠰 main';
        }

        const worktree = this.getGitWorktree();

        if (worktree) {
            return item.rawValue ? worktree : `𖠰 ${worktree}`;
        }

        return '𖠰 no git';
    }

    private getGitWorktree(): string | null {
        try {
            const worktreeDir = execSync('git rev-parse --git-dir', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();

            // /some/path/.git or .git
            if (worktreeDir.endsWith('/.git') || worktreeDir === '.git') {
                return 'main';
            }

            // /some/path/.git/worktrees/some-worktree or /some/path/.git/worktrees/some-dir/some-worktree
            const [, worktree] = worktreeDir.split('.git/worktrees/');

            return worktree ?? null;
        } catch {
            return null;
        }
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}