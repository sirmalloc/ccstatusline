import {
    Box,
    Text,
    useInput,
    useStdout
} from 'ink';
import React, { useState } from 'react';

import { applyColors } from '../../../utils/colors';
import { shouldInsertInput } from '../../../utils/input-guards';

import {
    PALETTE_ROW_COUNT,
    getPaletteLabel,
    getPaletteMarkerColor,
    getPaletteRow,
    movePaletteIndex,
    type PaletteDirection
} from './palette';

export interface PalettePickerProps {
    title: string;
    initialIndex: number;
    onHighlight: (index: number) => void;
    onSelect: (index: number) => void;
    onCancel: () => void;
}

// Two-character cells make the cube rows 72 columns wide; narrower terminals
// get one-character cells
const WIDE_CELLS_MIN_COLUMNS = 76;
const CUBE_ROWS = Array.from({ length: PALETTE_ROW_COUNT - 2 }, (_, i) => i + 1);

export const PalettePicker: React.FC<PalettePickerProps> = ({ title, initialIndex, onHighlight, onSelect, onCancel }) => {
    const { stdout } = useStdout();
    const [index, setIndex] = useState(initialIndex);
    const [typed, setTyped] = useState('');
    const wide = (stdout.columns || 80) >= WIDE_CELLS_MIN_COLUMNS;

    const highlight = (next: number) => {
        setIndex(next);
        onHighlight(next);
    };

    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.return) {
            onSelect(index);
            return;
        }

        let direction: PaletteDirection | null = null;
        if (key.upArrow) {
            direction = 'up';
        } else if (key.downArrow) {
            direction = 'down';
        } else if (key.leftArrow) {
            direction = 'left';
        } else if (key.rightArrow) {
            direction = 'right';
        }
        if (direction) {
            setTyped('');
            highlight(movePaletteIndex(index, direction));
            return;
        }

        if (key.backspace || key.delete) {
            const remaining = typed.slice(0, -1);
            setTyped(remaining);
            if (remaining) {
                highlight(Number(remaining));
            }
            return;
        }

        // Digits jump to that color number; a digit that would go past 255
        // starts a new number
        if (shouldInsertInput(input, key) && /^\d$/.test(input)) {
            const appended = typed + input;
            const next = appended.length <= 3 && Number(appended) <= 255 ? appended : input;
            setTyped(next);
            highlight(Number(next));
        }
    });

    const renderRow = (row: number) => getPaletteRow(row).map((cell) => {
        const selected = cell === index;
        const blank = wide ? '  ' : ' ';
        const marker = wide ? '[]' : '*';
        return applyColors(selected ? marker : blank, selected ? getPaletteMarkerColor(cell) : undefined, `ansi256:${cell}`, false, 'ansi256');
    }).join('');

    return (
        <Box flexDirection='column'>
            <Text bold>{title}</Text>
            <Box marginTop={1}>
                <Text dimColor>←→↑↓ move, type a number to jump, Enter apply, ESC cancel</Text>
            </Box>
            <Box marginTop={1} flexDirection='column'>
                <Text>{renderRow(0)}</Text>
                <Box marginTop={1} flexDirection='column'>
                    {CUBE_ROWS.map(row => <Text key={row}>{renderRow(row)}</Text>)}
                </Box>
                <Box marginTop={1}>
                    <Text>{renderRow(PALETTE_ROW_COUNT - 1)}</Text>
                </Box>
            </Box>
            <Box marginTop={1}>
                <Text>{getPaletteLabel(index)}</Text>
                {typed && <Text dimColor>{`    typed: ${typed}`}</Text>}
            </Box>
        </Box>
    );
};
