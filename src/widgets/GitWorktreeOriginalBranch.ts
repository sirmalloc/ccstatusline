import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class GitWorktreeOriginalBranchWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Git branch checked out before entering the worktree'; }
    getDisplayName(): string { return 'Git Worktree Original Branch'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(_item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return 'main';
        }

        const originalBranch = context.data?.worktree?.original_branch;
        return originalBranch ?? null;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}