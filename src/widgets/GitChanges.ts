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
    getGitChangeCounts,
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

const INSERTIONS_SLOT: SymbolSlot = { id: 'symbolInsertions', label: 'Insertions', defaultSymbol: '+' };
const DELETIONS_SLOT: SymbolSlot = { id: 'symbolDeletions', label: 'Deletions', defaultSymbol: '-' };

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when there are no changes' };

export class GitChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows git changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'Git Changes'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE, ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);

        if (context.isPreview) {
            return `(${getSlotSymbol(item, INSERTIONS_SLOT)}42,${getSlotSymbol(item, DELETIONS_SLOT)}10)`;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const changes = getGitChangeCounts(context);
        if (changes.insertions === 0 && changes.deletions === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return `(${getSlotSymbol(item, INSERTIONS_SLOT)}${changes.insertions},${getSlotSymbol(item, DELETIONS_SLOT)}${changes.deletions})`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [INSERTIONS_SLOT, DELETIONS_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
