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
    onAppend: () => void;
    onSelect: (line: number) => void;
    onBack: () => void;
    onDelete: (line: number) => void;
    initialSelection?: number;
    title?: string;
    blockIfPowerlineActive?: boolean;
    settings?: Settings;
}

const LineSelector: React.FC<LineSelectorProps> = ({
    lines,
    onAppend,
    onSelect,
    onBack,
    onDelete,
    initialSelection = 0,
    title,
    blockIfPowerlineActive = false,
    settings
}) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);

    // Check if powerline theme is managing colors
    const powerlineEnabled = settings ? settings.powerline.enabled : false;
    const powerlineTheme = settings ? settings.powerline.theme : undefined;
    const isThemeManaged
    = blockIfPowerlineActive
        && powerlineEnabled
        && powerlineTheme
        && powerlineTheme !== 'custom';

    // Handle keyboard input
    useInput((input, key) => {
    // If theme-managed and blocking is enabled, any key goes back
        if (isThemeManaged) {
            onBack();
            return;
        }

        switch (input) {
        case 'i':
            onAppend();
            setSelectedIndex(lines.length);
            return;
        case 'd':
            onDelete(selectedIndex);
            setSelectedIndex(Math.max(0, selectedIndex - 1));
            return;
        }

        if (key.escape) {
            onBack();
        } else if (key.upArrow) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
        } else if (key.downArrow) {
            setSelectedIndex(Math.min(lines.length, selectedIndex + 1));
        } else if (key.return) {
            if (selectedIndex === lines.length) {
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
                        {' '
                            + powerlineTheme.charAt(0).toUpperCase()
                            + powerlineTheme.slice(1)}
                    </Text>
                </Box>
                <Box marginTop={1}>
                    <Text dimColor>To customize colors, either:</Text>
                </Box>
                <Box marginLeft={2}>
                    <Text dimColor>
                        • Change to 'Custom' theme in Powerline Configuration → Themes
                    </Text>
                </Box>
                <Box marginLeft={2}>
                    <Text dimColor>
                        • Disable Powerline mode in Powerline Configuration
                    </Text>
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
            <Text dimColor>
                Choose which status line to configure (up to 3 lines supported)
            </Text>
            <Text dimColor>
                (i) to append new line, (d) to delete line, ESC to go back
            </Text>
            <Box marginTop={1} flexDirection='column'>
                {lines.map((line, index) => (
                    <Box key={index}>
                        <Text color={selectedIndex === index ? 'green' : undefined}>
                            {selectedIndex === index ? '▶  ' : '   '}
                            ☰ Line
                            {index + 1}
                            {line.length > 0 ? ` (${line.length} widgets)` : ' (empty)'}
                        </Text>
                    </Box>
                ))}

                <Box marginTop={1}>
                    <Text color={selectedIndex === lines.length ? 'green' : undefined}>
                        {selectedIndex === lines.length ? '▶  ' : '   '}
                        ← Back
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};

export { LineSelector, type LineSelectorProps };