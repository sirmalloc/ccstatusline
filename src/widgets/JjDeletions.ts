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
    getJjChangeCounts,
    isInsideJjRepo
} from '../utils/jj';

import {
    NO_JJ_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const DELETIONS_SLOT: SymbolSlot = { id: 'symbolDeletions', label: 'Deletions', defaultSymbol: '-' };

export class JjDeletionsWidget implements Widget {
    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Shows jujutsu deletions count'; }
    getDisplayName(): string { return 'JJ Deletions'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_JJ_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = isHidden(item, NO_JJ_HIDEABLE_STATE.key);

        if (context.isPreview) {
            return `${getSlotSymbol(item, DELETIONS_SLOT)}10`;
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = getJjChangeCounts(context);
        return `${getSlotSymbol(item, DELETIONS_SLOT)}${changes.deletions}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [DELETIONS_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
