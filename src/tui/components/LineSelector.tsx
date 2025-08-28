import {
    Box,
    Text,
    useInput
} from 'ink';
import pluralize from 'pluralize';
import React, {
    useMemo,
    useState
} from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

import { ConfirmDialog } from './ConfirmDialog';

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
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const selectedLine = useMemo(
        () => lines[selectedIndex],
        [lines, selectedIndex]
    );

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
        if (showDeleteDialog) {
            return;
        }

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
            setShowDeleteDialog(true);
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

    if (showDeleteDialog && selectedLine) {
        const suffix
      = selectedLine.length > 0
          ? pluralize('widget', selectedLine.length, true)
          : 'empty';

        return (
            <Box flexDirection='column'>
                <Box flexDirection='column' gap={1}>
                    <Text bold>
                        <Text>
                            <Text>
                                ☰ Line
                                {selectedIndex + 1}
                            </Text>
                            <Text dimColor>
                                (
                                {suffix}
                                )
                            </Text>
                        </Text>
                    </Text>
                    <Text bold>Are you sure you want to delete line?</Text>
                </Box>

                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            onDelete(selectedIndex);
                            setSelectedIndex(Math.max(0, selectedIndex - 1));
                            setShowDeleteDialog(false);
                        }}
                        onCancel={() => {
                            setShowDeleteDialog(false);
                        }}
                    />
                </Box>
            </Box>
        );
    }

    return (
        <>
            <Box flexDirection='column'>
                <Text bold>{title ?? 'Select Line to Edit'}</Text>
                <Text dimColor>
                    Choose which status line to configure (up to 3 lines supported)
                </Text>
                <Text dimColor>
                    (i) to append new line, (d) to delete line, ESC to go back
                </Text>

                <Box marginTop={1} flexDirection='column'>
                    {lines.map((line, index) => {
                        const isSelected = selectedIndex === index;
                        const suffix = line.length
                            ? pluralize('widget', line.length, true)
                            : 'empty';

                        return (
                            <Box key={index}>
                                <Text color={isSelected ? 'green' : undefined}>
                                    <Text>{isSelected ? '▶  ' : '   '}</Text>
                                    <Text>
                                        <Text>
                                            ☰ Line
                                            {index + 1}
                                        </Text>
                                        <Text dimColor={!isSelected}>
                                            (
                                            {suffix}
                                            )
                                        </Text>
                                    </Text>
                                </Text>
                            </Box>
                        );
                    })}

                    <Box marginTop={1}>
                        <Text color={selectedIndex === lines.length ? 'green' : undefined}>
                            {selectedIndex === lines.length ? '▶  ' : '   '}
                            ← Back
                        </Text>
                    </Box>
                </Box>
            </Box>
        </>
    );
};

export { LineSelector, type LineSelectorProps };