import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../types/Widget';

interface LineSelectorProps {
    lines: WidgetItem[][];
    onSelect: (line: number) => void;
    onBack: () => void;
    initialSelection?: number;
}

const LineSelector: React.FC<LineSelectorProps> = ({ lines, onSelect, onBack, initialSelection = 0 }) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);

    // Handle keyboard input
    useInput((input, key) => {
        if (key.escape) {
            onBack();
        } else if (key.upArrow) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
        } else if (key.downArrow) {
            setSelectedIndex(Math.min(3, selectedIndex + 1)); // 0-2 for lines, 3 for back
        } else if (key.return) {
            if (selectedIndex === 3) {
                onBack();
            } else {
                onSelect(selectedIndex);
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Select Line to Edit</Text>
            <Text dimColor>Choose which status line to configure (up to 3 lines supported)</Text>
            <Text dimColor>Press ESC to go back</Text>
            <Box marginTop={1} flexDirection='column'>
                <Box>
                    <Text color={selectedIndex === 0 ? 'green' : undefined}>
                        {selectedIndex === 0 ? '▶  ' : '   '}
                        ☰ Line 1
                        {lines[0] && lines[0].length > 0 ? ` (${lines[0].length} items)` : ' (empty)'}
                    </Text>
                </Box>
                <Box>
                    <Text color={selectedIndex === 1 ? 'green' : undefined}>
                        {selectedIndex === 1 ? '▶  ' : '   '}
                        ☰ Line 2
                        {lines[1] && lines[1].length > 0 ? ` (${lines[1].length} items)` : ' (empty)'}
                    </Text>
                </Box>
                <Box>
                    <Text color={selectedIndex === 2 ? 'green' : undefined}>
                        {selectedIndex === 2 ? '▶  ' : '   '}
                        ☰ Line 3
                        {lines[2] && lines[2].length > 0 ? ` (${lines[2].length} items)` : ' (empty)'}
                    </Text>
                </Box>

                <Box marginTop={1}>
                    <Text color={selectedIndex === 3 ? 'green' : undefined}>
                        {selectedIndex === 3 ? '▶  ' : '   '}
                        ← Back
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};

export { LineSelector, type LineSelectorProps };