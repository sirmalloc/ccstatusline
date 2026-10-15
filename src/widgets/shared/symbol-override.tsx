import React from 'react';

import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';

import { lazyEditor } from './lazy-editor';
import { removeMetadataKeys } from './metadata';

export const SYMBOL_OVERRIDE_ACTION = 'edit-symbol-override';

const SYMBOL_KEYBIND: CustomKeybind = {
    key: 'g',
    label: '(g)lyph',
    action: SYMBOL_OVERRIDE_ACTION
};

export function getSymbolKeybind(): CustomKeybind {
    return SYMBOL_KEYBIND;
}

// One editable symbol of a widget. id 'character' stores on the item's
// character field (the pre-existing override convention); any other id is a
// metadata key, which is how widgets with several symbols keep them apart.
export interface SymbolSlot {
    id: string;
    label: string;
    defaultSymbol: string;
}

/** The effective symbol for an item: its character override, or the widget default. */
export function getSymbol(item: WidgetItem, defaultSymbol: string): string {
    return item.character ?? defaultSymbol;
}

/** The symbol plus its joining space; an empty override collapses the space too. */
export function formatSymbolPrefix(item: WidgetItem, defaultSymbol: string): string {
    const symbol = getSymbol(item, defaultSymbol);
    return symbol.length > 0 ? `${symbol} ` : '';
}

export function getSlotSymbol(item: WidgetItem, slot: SymbolSlot): string {
    if (slot.id === 'character') {
        return getSymbol(item, slot.defaultSymbol);
    }

    return item.metadata?.[slot.id] ?? slot.defaultSymbol;
}

// Overrides matching the widget default are removed so untouched items stay
// minimal. Exported for tests.
export function setSlotSymbol(item: WidgetItem, slot: SymbolSlot, value: string): WidgetItem {
    if (slot.id === 'character') {
        if (value === slot.defaultSymbol) {
            const { character, ...rest } = item;
            return rest;
        }

        return { ...item, character: value };
    }

    if (value === slot.defaultSymbol) {
        return removeMetadataKeys(item, [slot.id]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [slot.id]: value
        }
    };
}

export function renderSymbolOverrideEditor(props: WidgetEditorProps, defaultSymbol: string): React.ReactElement {
    return renderSymbolSlotsEditor(props, [{ id: 'character', label: 'Glyph', defaultSymbol }]);
}

export function renderSymbolSlotsEditor(props: WidgetEditorProps, slots: SymbolSlot[]): React.ReactElement {
    return <SymbolSlotsEditor {...props} slots={slots} />;
}

const SymbolSlotsEditor = lazyEditor(() => import('../editors/SymbolSlotsEditor'));
