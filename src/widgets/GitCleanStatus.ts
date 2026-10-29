import type { RenderContext } from '../types/RenderContext';
import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { getGitStatus } from '../utils/git';

import { GitStatusWidgetBase } from './shared/git-status-widget';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const CLEAN_SLOT: SymbolSlot = { id: 'symbolClean', label: 'Clean', defaultSymbol: '✓' };
const DIRTY_SLOT: SymbolSlot = { id: 'symbolDirty', label: 'Dirty', defaultSymbol: '✗' };

export class GitCleanStatusWidget extends GitStatusWidgetBase {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows ✓ when the working tree is clean and ✗ when it is dirty'; }
    getDisplayName(): string { return 'Git Clean Status'; }

    protected renderPreview(item: WidgetItem): string {
        return item.rawValue ? 'clean' : getSlotSymbol(item, CLEAN_SLOT);
    }

    protected renderInWorkTree(item: WidgetItem, context: RenderContext): string {
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
}
