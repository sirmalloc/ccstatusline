import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import {
    getGitStatus,
    isInsideGitWorkTree
} from '../../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './hideable';
import {
    getSymbol,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './symbol-override';

// Git Staged, Unstaged, Untracked, Clean Status, Status and SHA show the work
// tree's state. Outside a git work tree they show "(no git)", or nothing when
// that state is hidden. Each says what it shows in the TUI preview and inside
// a work tree.
export abstract class GitStatusWidgetBase implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;
    abstract supportsRawValue(): boolean;

    protected abstract renderPreview(item: WidgetItem): string;
    protected abstract renderInWorkTree(item: WidgetItem, context: RenderContext): string | null;

    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return this.renderPreview(item);
        }

        if (!isInsideGitWorkTree(context)) {
            return isHidden(item, NO_GIT_HIDEABLE_STATE.key) ? null : '(no git)';
        }

        return this.renderInWorkTree(item, context);
    }

    supportsColors(_item: WidgetItem): boolean { return true; }
}

// Git Staged, Unstaged and Untracked show their glyph, or "true" when raw,
// while git status reports their kind of change, and nothing otherwise
export abstract class GitStatusFlagWidget extends GitStatusWidgetBase {
    protected abstract readonly flag: 'staged' | 'unstaged' | 'untracked';
    protected abstract readonly defaultSymbol: string;

    protected renderPreview(item: WidgetItem): string {
        return this.formatFlag(item);
    }

    protected renderInWorkTree(item: WidgetItem, context: RenderContext): string | null {
        return getGitStatus(context)[this.flag] ? this.formatFlag(item) : null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, this.defaultSymbol);
    }

    getNumericValue(context: RenderContext, _item: WidgetItem): number | null {
        if (!isInsideGitWorkTree(context))
            return null;
        return getGitStatus(context)[this.flag] ? 1 : 0;
    }

    supportsRawValue(): boolean { return true; }

    private formatFlag(item: WidgetItem): string {
        return item.rawValue ? 'true' : getSymbol(item, this.defaultSymbol);
    }
}
