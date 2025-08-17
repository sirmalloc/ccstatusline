import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

interface LineSelectorProps {
    lines: WidgetItem[][];
    onSelect: (line: number) => void;
    onBack: () => void;
    initialSelection?: number;
    title?: string;
    blockIfPowerlineActive?: boolean;
    settings?: Settings;
}

const LineSelector: React.FC<LineSelectorProps> = ({ lines, onSelect, onBack, initialSelection = 0, title, blockIfPowerlineActive = false, settings }) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);

    // Check if powerline theme is managing colors
    const powerlineEnabled = settings ? settings.powerline.enabled : false;
    const powerlineTheme = settings ? settings.powerline.theme : undefined;
    const isThemeManaged = blockIfPowerlineActive && powerlineEnabled && powerlineTheme && powerlineTheme !== 'custom';

    // Handle keyboard input
    useInput((input, key) => {
        // If theme-managed and blocking is enabled, any key goes back
        if (isThemeManaged) {
            onBack();
            return;
        }

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

    // Show powerline theme warning if applicable
    if (isThemeManaged) {
        return (
            <Box flexDirection='column'>
                <Text bold>{title ?? 'Select Line'}</Text>
                <Box marginTop={1}>
                    <Text color='yellow'>
                        ⚠ Colors are currently managed by the Powerline theme:
                        {' ' + powerlineTheme.charAt(0).toUpperCase() + powerlineTheme.slice(1)}
                    </Text>
                </Box>
                <Box marginTop={1}>
                    <Text dimColor>To customize colors, either:</Text>
                </Box>
                <Box marginLeft={2}>
                    <Text dimColor>• Change to 'Custom' theme in Powerline Configuration → Themes</Text>
                </Box>
                <Box marginLeft={2}>
                    <Text dimColor>• Disable Powerline mode in Powerline Configuration</Text>
                </Box>
                <Box marginTop={2}>
                    <Text>Press any key to go back...</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>{title ?? 'Select Line to Edit'}</Text>
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