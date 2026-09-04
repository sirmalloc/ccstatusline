import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    getGitStatus,
    isInsideGitWorkTree
} from '../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const CLEAN_SLOT: SymbolSlot = { id: 'symbolClean', label: 'Clean', defaultSymbol: '✓' };
const DIRTY_SLOT: SymbolSlot = { id: 'symbolDirty', label: 'Dirty', defaultSymbol: '✗' };

export class GitCleanStatusWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows ✓ when the working tree is clean and ✗ when it is dirty'; }
    getDisplayName(): string { return 'Git Clean Status'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);

        if (context.isPreview) {
            return item.rawValue ? 'clean' : getSlotSymbol(item, CLEAN_SLOT);
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const clean = this.isClean(context);
        if (item.rawValue) {
            return clean ? 'clean' : 'dirty';
        }

        return clean ? getSlotSymbol(item, CLEAN_SLOT) : getSlotSymbol(item, DIRTY_SLOT);
    }

    private isClean(context: RenderContext): boolean {
        const status = getGitStatus(context);
        return !status.staged && !status.unstaged && !status.untracked && !status.conflicts;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [CLEAN_SLOT, DIRTY_SLOT]);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
