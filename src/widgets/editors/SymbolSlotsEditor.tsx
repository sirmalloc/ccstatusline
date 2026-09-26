import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { getVisibleWidth } from '../../utils/ansi';
import { shouldInsertInput } from '../../utils/input-guards';
import {
    getSlotSymbol,
    setSlotSymbol,
    type SymbolSlot
} from '../shared/symbol-override';

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
    const labelWidth = Math.max(...slots.map(slot => getVisibleWidth(slot.label)), 0);

    useInput((input, key) => {
        if (key.return) {
            onComplete(slots.reduce((item, slot, index) => setSlotSymbol(item, slot, values[index] ?? ''), widget));
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow && slots.length > 1) {
            setSelectedIndex(selectedIndex - 1 < 0 ? slots.length - 1 : selectedIndex - 1);
        } else if (key.downArrow && slots.length > 1) {
            setSelectedIndex(selectedIndex + 1 > slots.length - 1 ? 0 : selectedIndex + 1);
        } else if (key.tab) {
            setValues(values.map((value, index) => (
                index === selectedIndex ? slots[selectedIndex]?.defaultSymbol ?? '' : value
            )));
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
                    ? '↑↓ row, type to set, Tab default, Backspace none, Enter save, ESC cancel'
                    : 'Type any character or emoji, Tab default, Backspace none, Enter save, ESC cancel'}
            </Text>
            <Box marginTop={1} flexDirection='column'>
                {slots.map((slot, index) => {
                    const isSelected = index === selectedIndex;
                    const value = values[index] ?? '';
                    const labelPadding = ' '.repeat(Math.max(labelWidth - getVisibleWidth(slot.label), 0));
                    return (
                        <Box key={slot.id} flexDirection='row' flexWrap='nowrap'>
                            <Box width={4}>
                                <Text color={isSelected ? 'green' : undefined}>
                                    {isSelected ? '▶ ' : '  '}
                                </Text>
                            </Box>
                            <Text color={isSelected ? 'green' : undefined}>
                                {`${labelPadding}${slot.label}: `}
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

export default SymbolSlotsEditor;
