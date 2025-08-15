import {
    Box,
    Text,
    useInput
} from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

import type { WidgetItem } from '../../utils/config';

interface LineSelectorProps {
    lines: WidgetItem[][];
    onSelect: (line: number) => void;
    onBack: () => void;
    initialSelection?: number;
}

const LineSelector: React.FC<LineSelectorProps> = ({ lines, onSelect, onBack, initialSelection = 0 }) => {
    const items = [
        { label: `📝 Line 1${lines[0] && lines[0].length > 0 ? ` (${lines[0].length} items)` : ' (empty)'}`, value: 0 },
        { label: `📝 Line 2${lines[1] && lines[1].length > 0 ? ` (${lines[1].length} items)` : ' (empty)'}`, value: 1 },
        { label: `📝 Line 3${lines[2] && lines[2].length > 0 ? ` (${lines[2].length} items)` : ' (empty)'}`, value: 2 },
        { label: '← Back', value: -1 }
    ];

    const handleSelect = (item: { value: number }) => {
        if (item.value === -1) {
            onBack();
        } else {
            onSelect(item.value);
        }
    };

    // Handle ESC key
    useInput((input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Select Line to Edit</Text>
            <Text dimColor>Choose which status line to configure (up to 3 lines supported)</Text>
            <Text dimColor>Press ESC to go back</Text>
            <Box marginTop={1}>
                <SelectInput
                    items={items}
                    onSelect={handleSelect}
                    initialIndex={Math.min(initialSelection, lines.length - 1)}
                    indicatorComponent={({ isSelected }) => (
                        <Text>{isSelected ? '▶' : '  '}</Text>
                    )}
                    itemComponent={({ isSelected, label }) => (
                        <Text color={isSelected ? 'green' : undefined}>
                            {' '}
                            {label}
                        </Text>
                    )}
                />
            </Box>
        </Box>
    );
};

export { LineSelector, type LineSelectorProps };