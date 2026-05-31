import {
    Box,
    Text,
    useInput
} from 'ink';
import pluralize from 'pluralize';
import React, {
    useEffect,
    useMemo,
    useState
} from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

import { ConfirmDialog } from './ConfirmDialog';
import { List } from './List';

interface LineSelectorProps {
    lines: WidgetItem[][];
    onSelect: (line: number) => void;
    onBack: () => void;
    onLinesUpdate: (lines: WidgetItem[][]) => void;
    initialSelection?: number;
    title?: string;
    blockIfPowerlineActive?: boolean;
    settings?: Settings;
    allowEditing?: boolean;
}

const LineSelector: React.FC<LineSelectorProps> = ({
    lines,
    onSelect,
    onBack,
    onLinesUpdate,
    initialSelection = 0,
    title,
    blockIfPowerlineActive = false,
    settings,
    allowEditing = false
}) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [moveMode, setMoveMode] = useState(false);
    const [localLines, setLocalLines] = useState(lines);

    useEffect(() => {
        setLocalLines(lines);
    }, [lines]);

    useEffect(() => {
        setSelectedIndex(initialSelection);
    }, [initialSelection]);

    const selectedLine = useMemo(
        () => localLines[selectedIndex],
        [localLines, selectedIndex]
    );

    const appendLine = () => {
        const newLines = [...localLines, []];
        setLocalLines(newLines);
        onLinesUpdate(newLines);
        setSelectedIndex(newLines.length - 1);
    };

    const deleteLine = (lineIndex: number) => {
    // Don't allow deleting the last remaining line
        if (localLines.length <= 1) {
            return;
        }
        const newLines = [...localLines];
        newLines.splice(lineIndex, 1);
        setLocalLines(newLines);
        onLinesUpdate(newLines);
    };

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

        if (moveMode) {
            if (key.upArrow && localLines.length > 1) {
                const newLines = [...localLines];
                const targetIndex = selectedIndex - 1 < 0 ? localLines.length - 1 : selectedIndex - 1;
                const temp = newLines[selectedIndex];
                const prev = newLines[targetIndex];
                if (temp && prev) {
                    [newLines[selectedIndex], newLines[targetIndex]] = [prev, temp];
                }
                setLocalLines(newLines);
                onLinesUpdate(newLines);
                setSelectedIndex(targetIndex);
            } else if (key.downArrow && localLines.length > 1) {
                const newLines = [...localLines];
                const targetIndex = selectedIndex + 1 > localLines.length - 1 ? 0 : selectedIndex + 1;
                const temp = newLines[selectedIndex];
                const next = newLines[targetIndex];
                if (temp && next) {
                    [newLines[selectedIndex], newLines[targetIndex]] = [next, temp];
                }
                setLocalLines(newLines);
                onLinesUpdate(newLines);
                setSelectedIndex(targetIndex);
            } else if (key.escape || key.return) {
                setMoveMode(false);
            }
            return;
        }

        switch (input) {
            case 'a':
                if (allowEditing) {
                    appendLine();
                }
                return;
            case 'd':
                if (allowEditing && localLines.length > 1 && selectedIndex < localLines.length) {
                    setShowDeleteDialog(true);
                }
                return;
            case 'm':
                if (allowEditing && localLines.length > 1 && selectedIndex < localLines.length) {
                    setMoveMode(true);
                }
                return;
        }

        if (key.escape) {
            onBack();
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
                            {' '}
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
                            deleteLine(selectedIndex);
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

    const lineItems = localLines.map((line, index) => ({
        label: `☰ Line ${index + 1}`,
        sublabel: `(${line.length > 0 ? pluralize('widget', line.length, true) : 'empty'})`,
        value: index
    }));

    return (
        <>
            <Box flexDirection='column'>
                <Box>
                    <Text bold>
                        {title ?? 'Select Line to Edit'}
                        {' '}
                    </Text>
                    {moveMode && <Text color='blue'>[MOVE MODE]</Text>}
                </Box>
                <Text dimColor>
                    Choose which status line to configure
                </Text>
                {moveMode ? (
                    <Text dimColor>↑↓ to move line, ESC or Enter to exit move mode</Text>
                ) : (
                    <Text dimColor>
                        {allowEditing ? (
                            localLines.length > 1
                                ? '(a) to append new line, (d) to delete line, (m) to move line, ESC to go back'
                                : '(a) to append new line, ESC to go back'
                        ) : 'ESC to go back'}
                    </Text>
                )}

                {moveMode ? (
                    <Box marginTop={1} flexDirection='column'>
                        {localLines.map((line, index) => {
                            const isSelected = selectedIndex === index;
                            const suffix = line.length
                                ? pluralize('widget', line.length, true)
                                : 'empty';

                            return (
                                <Box key={index}>
                                    <Text color={isSelected ? 'blue' : undefined}>
                                        <Text>{isSelected ? '◆  ' : '   '}</Text>
                                        <Text>
                                            <Text>
                                                ☰ Line
                                                {' '}
                                                {index + 1}
                                            </Text>
                                            {' '}
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
                    </Box>
                ) : (
                    <List
                        marginTop={1}
                        items={lineItems}
                        onSelect={(line) => {
                            if (line === 'back') {
                                onBack();
                                return;
                            }

                            onSelect(line);
                        }}
                        onSelectionChange={(_, index) => {
                            setSelectedIndex(index);
                        }}
                        initialSelection={selectedIndex}
                        showBackButton={true}
                    />
                )}
            </Box>
        </>
    );
};

export { LineSelector, type LineSelectorProps };
