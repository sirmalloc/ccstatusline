import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';

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
            void character;
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

// Helper to get grapheme segments if Intl.Segmenter is available
function getFirstGrapheme(str: string): string {
    if (str.length === 0) {
        return '';
    }

    if ('Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        const segments = Array.from(segmenter.segment(str));
        return segments[0]?.segment ?? '';
    }

    // Fallback: just take first character
    return Array.from(str)[0] ?? '';
}

const SymbolSlotsEditor: React.FC<WidgetEditorProps & { slots: SymbolSlot[] }> = ({ widget, slots, onComplete, onCancel }) => {
    const [values, setValues] = useState<string[]>(() => slots.map(slot => getSlotSymbol(widget, slot)));
    const [selectedIndex, setSelectedIndex] = useState(0);

    useInput((input, key) => {
        if (key.return) {
            onComplete(slots.reduce((item, slot, index) => setSlotSymbol(item, slot, values[index] ?? ''), widget));
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow && slots.length > 1) {
            setSelectedIndex(selectedIndex - 1 < 0 ? slots.length - 1 : selectedIndex - 1);
        } else if (key.downArrow && slots.length > 1) {
            setSelectedIndex(selectedIndex + 1 > slots.length - 1 ? 0 : selectedIndex + 1);
        } else if (key.backspace || key.delete) {
            setValues(values.map((value, index) => (index === selectedIndex ? '' : value)));
        } else if (shouldInsertInput(input, key)) {
            // Take only the first grapheme (handles multi-byte emojis correctly)
            const grapheme = getFirstGrapheme(input);
            setValues(values.map((value, index) => (index === selectedIndex ? grapheme : value)));
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Glyphs</Text>
            <Text dimColor>
                {slots.length > 1
                    ? '↑↓ select, type to set, Backspace none, Enter save, ESC cancel'
                    : 'Type any character or emoji, Backspace for none, Enter save, ESC cancel'}
            </Text>
            <Box marginTop={1} flexDirection='column'>
                {slots.map((slot, index) => {
                    const isSelected = index === selectedIndex;
                    const value = values[index] ?? '';
                    return (
                        <Box key={slot.id} flexDirection='row' flexWrap='nowrap'>
                            <Box width={3}>
                                <Text color={isSelected ? 'green' : undefined}>
                                    {isSelected ? '▶ ' : '  '}
                                </Text>
                            </Box>
                            <Text color={isSelected ? 'green' : undefined}>
                                {`${slot.label}: `}
                            </Text>
                            {value ? (
                                <Text inverse>{value}</Text>
                            ) : (
                                <Text inverse dimColor>(none)</Text>
                            )}
                            <Text dimColor>{` (default: ${slot.defaultSymbol})`}</Text>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};
