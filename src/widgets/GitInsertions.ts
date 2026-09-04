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

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when the insertion count is zero' };
const INSERTIONS_SLOT: SymbolSlot = { id: 'symbolInsertions', label: 'Insertions', defaultSymbol: '+' };

export class GitInsertionsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows git insertions count'; }
    getDisplayName(): string { return 'Git Insertions'; }
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
            return `${getSlotSymbol(item, INSERTIONS_SLOT)}42`;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const changes = getGitChangeCounts(context);
        if (changes.insertions === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return `${getSlotSymbol(item, INSERTIONS_SLOT)}${changes.insertions}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [INSERTIONS_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
