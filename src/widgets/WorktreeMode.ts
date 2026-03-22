import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class WorktreeModeWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows indicator when Claude Code is in worktree mode'; }
    getDisplayName(): string { return 'Worktree Mode'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '[wt]' : '⎇';
        }

        const worktree = context.data?.worktree;
        const isInWorktree = worktree !== undefined && worktree !== null;

        if (!isInWorktree) {
            return null;
        }

        return item.rawValue ? '[wt]' : '⎇';
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}