import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class GitWorktreeModeWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows indicator when Claude Code is in worktree mode'; }
    getDisplayName(): string { return 'Git Worktree Mode'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const worktree = context.isPreview ? true : context.data?.worktree;
        const isInWorktree = worktree !== undefined && worktree !== null;

        if (item.rawValue) {
            return isInWorktree ? 'true' : 'false';
        }

        if (!isInWorktree) {
            return null;
        }

        return '⎇';
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}