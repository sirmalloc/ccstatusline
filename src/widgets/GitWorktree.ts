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

import { makeModifierText } from './shared/editor-display';
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
        const modifiers: string[] = [];
        if (item.metadata?.fishStyle === 'true')
            modifiers.push('fish-style');
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-fish-style') {
            const enabled = item.metadata?.fishStyle === 'true';
            const { fishStyle, ...restMetadata } = item.metadata ?? {};
            const nextMetadata = enabled ? restMetadata : { ...restMetadata, fishStyle: 'true' };
            return {
                ...item,
                metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);
        const fishStyle = item.metadata?.fishStyle === 'true';
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview) {
            const preview = this.abbreviateWorktree('main', fishStyle);
            return item.rawValue ? preview : `${prefix}${preview}`;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : `${prefix}no git`;
        }

        const worktree = this.getGitWorktree(context);
        if (worktree) {
            const displayWorktree = this.abbreviateWorktree(worktree, fishStyle);
            return item.rawValue ? displayWorktree : `${prefix}${displayWorktree}`;
        }

        return hideNoGit ? null : `${prefix}no git`;
    }

    // Same fish-style rule as Git Branch: every segment but the last collapses
    // to its first character, so 'main' -> 'm' and 'dir/wt' -> 'd/wt'.
    private abbreviateWorktree(worktree: string, fishStyle: boolean): string {
        if (!fishStyle) {
            return worktree;
        }
        const parts = worktree.split('/');
        if (parts.length === 1) {
            return worktree[0] ?? '';
        }
        return parts.map((part, index) => (index === parts.length - 1 ? part : part[0] ?? '')).join('/');
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
            { key: 'f', label: '(f)ish style', action: 'toggle-fish-style' },
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
