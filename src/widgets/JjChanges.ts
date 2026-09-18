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
    isInsideJjRepo,
    runJjArgs
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

const INSERTIONS_SLOT: SymbolSlot = { id: 'symbolInsertions', label: 'Insertions', defaultSymbol: '+' };
const DELETIONS_SLOT: SymbolSlot = { id: 'symbolDeletions', label: 'Deletions', defaultSymbol: '-' };

export class JjChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows jujutsu changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'JJ Changes'; }
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
            return `(${getSlotSymbol(item, INSERTIONS_SLOT)}42,${getSlotSymbol(item, DELETIONS_SLOT)}10)`;
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = this.getJjChanges(context);
        if (changes) {
            return `(${getSlotSymbol(item, INSERTIONS_SLOT)}${changes.insertions},${getSlotSymbol(item, DELETIONS_SLOT)}${changes.deletions})`;
        }

        return hideNoJj ? null : '(no jj)';
    }

    private getJjChanges(context: RenderContext): { insertions: number; deletions: number } | null {
        const stat = runJjArgs(['diff', '--stat'], context);

        let totalInsertions = 0;
        let totalDeletions = 0;

        if (stat) {
            const lines = stat.split('\n');
            const summaryLine = lines[lines.length - 1];
            if (summaryLine) {
                const insertMatch = /(\d+) insertion/.exec(summaryLine);
                const deleteMatch = /(\d+) deletion/.exec(summaryLine);
                totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
                totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
            }
        }

        return { insertions: totalInsertions, deletions: totalDeletions };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [INSERTIONS_SLOT, DELETIONS_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(): boolean { return true; }
}
