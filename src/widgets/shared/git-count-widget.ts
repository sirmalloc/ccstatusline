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
    getGitChangeCounts,
    getGitFileStatusCounts,
    isInsideGitWorkTree,
    type GitChangeCounts,
    type GitFileStatusCounts
} from '../../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './hideable';
import { formatRawOrLabeledValue } from './raw-or-labeled';
import {
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './symbol-override';

const ZERO_HIDE_KEY = 'zero';

// Git Staged, Unstaged and Untracked Files, Insertions, Deletions and Changes
// show counts read from the work tree. Outside a git work tree they show
// "(no git)", or nothing when that state is hidden; with the zero state hidden
// they show nothing while their count is zero. Each reads its counts, says
// when they count as zero, and formats them, its preview sample included.
export abstract class GitCountWidgetBase<Counts> implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;
    abstract supportsRawValue(): boolean;

    // The zero hide state's label, e.g. "when the staged file count is zero"
    protected abstract readonly zeroLabel: string;
    protected abstract readonly previewCounts: Counts;
    protected abstract getCounts(context: RenderContext): Counts;
    protected abstract isZero(counts: Counts): boolean;
    protected abstract formatCounts(item: WidgetItem, counts: Counts): string;

    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE, { key: ZERO_HIDE_KEY, label: this.zeroLabel }];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return this.formatCounts(item, this.previewCounts);
        }

        if (!isInsideGitWorkTree(context)) {
            return isHidden(item, NO_GIT_HIDEABLE_STATE.key) ? null : '(no git)';
        }

        const counts = this.getCounts(context);
        if (this.isZero(counts) && isHidden(item, ZERO_HIDE_KEY)) {
            return null;
        }

        return this.formatCounts(item, counts);
    }

    supportsColors(_item: WidgetItem): boolean { return true; }
}

// Git Staged, Unstaged and Untracked Files show one of git status's file
// counts after a short label, or the bare count when raw
export abstract class GitFileCountWidget extends GitCountWidgetBase<number> {
    protected abstract readonly field: keyof GitFileStatusCounts;
    protected abstract readonly label: string;

    getLabelPrefix(): string { return this.label; }

    protected getCounts(context: RenderContext): number {
        return getGitFileStatusCounts(context)[this.field];
    }

    protected isZero(count: number): boolean {
        return count === 0;
    }

    protected formatCounts(item: WidgetItem, count: number): string {
        return formatRawOrLabeledValue(item, this.getLabelPrefix(), `${count}`);
    }

    getNumericValue(context: RenderContext, _item: WidgetItem): number | null {
        if (!isInsideGitWorkTree(context))
            return null;
        return getGitFileStatusCounts(context)[this.field];
    }

    supportsRawValue(): boolean { return true; }
}

// Git Insertions, Deletions and Changes show the lines added and removed across
// staged and unstaged changes, each count behind its own editable glyph
export abstract class GitLineCountWidget extends GitCountWidgetBase<GitChangeCounts> {
    protected readonly previewCounts: GitChangeCounts = { insertions: 42, deletions: 10 };
    protected abstract readonly slots: SymbolSlot[];

    protected getCounts(context: RenderContext): GitChangeCounts {
        return getGitChangeCounts(context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, this.slots);
    }

    supportsRawValue(): boolean { return false; }
}
