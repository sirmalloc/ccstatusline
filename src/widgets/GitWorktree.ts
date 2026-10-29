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
            return Array.from(worktree)[0] ?? '';
        }
        return parts.map((part, index) => (index === parts.length - 1 ? part : Array.from(part)[0] ?? '')).join('/');
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
