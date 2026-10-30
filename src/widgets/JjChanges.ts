import type { RenderContext } from '../types/RenderContext';
import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    runJjArgs,
    type JjChangeCounts
} from '../utils/jj';

import { JjWidgetBase } from './shared/jj-widget-base';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const INSERTIONS_SLOT: SymbolSlot = { id: 'symbolInsertions', label: 'Insertions', defaultSymbol: '+' };
const DELETIONS_SLOT: SymbolSlot = { id: 'symbolDeletions', label: 'Deletions', defaultSymbol: '-' };

export class JjChangesWidget extends JjWidgetBase<JjChangeCounts> {
    protected readonly previewValue = { insertions: 42, deletions: 10 };
    protected readonly noJjText = '(no jj)';

    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows jujutsu changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'JJ Changes'; }

    protected getValue(context: RenderContext): JjChangeCounts {
        const stat = runJjArgs(['diff', '--stat'], context);

        let totalInsertions = 0;
        let totalDeletions = 0;

        if (stat) {
            const lines = stat.split('\n');
            const summaryLine = lines[lines.length - 1];
            if (summaryLine) {
                const insertMatch = /(\d+) insertion/.exec(summaryLine);
                const deleteMatch = /(\d+) deletion/.exec(summaryLine);
                totalInsertions += insertMatch?.[1] ? Number.parseInt(insertMatch[1], 10) : 0;
                totalDeletions += deleteMatch?.[1] ? Number.parseInt(deleteMatch[1], 10) : 0;
            }
        }

        return { insertions: totalInsertions, deletions: totalDeletions };
    }

    protected formatValue(item: WidgetItem, changes: JjChangeCounts): string {
        return `(${getSlotSymbol(item, INSERTIONS_SLOT)}${changes.insertions},${getSlotSymbol(item, DELETIONS_SLOT)}${changes.deletions})`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [INSERTIONS_SLOT, DELETIONS_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
}
