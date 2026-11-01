import type { RenderContext } from '../types/RenderContext';
import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { getJjChangeCounts } from '../utils/jj';

import { JjWidgetBase } from './shared/jj-widget-base';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const INSERTIONS_SLOT: SymbolSlot = { id: 'symbolInsertions', label: 'Insertions', defaultSymbol: '+' };

export class JjInsertionsWidget extends JjWidgetBase<number> {
    protected readonly previewValue = 42;
    protected readonly noJjText = '(no jj)';

    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows jujutsu insertions count'; }
    getDisplayName(): string { return 'JJ Insertions'; }

    protected getValue(context: RenderContext): number {
        return getJjChangeCounts(context).insertions;
    }

    protected formatValue(item: WidgetItem, insertions: number): string {
        return `${getSlotSymbol(item, INSERTIONS_SLOT)}${insertions}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [INSERTIONS_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
}
