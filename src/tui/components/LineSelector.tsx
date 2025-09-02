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
    const [localLines, setLocalLines] = useState(lines);

    useEffect(() => {
        setLocalLines(lines);
    }, [lines]);

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

        switch (input) {
        case 'a':
            if (allowEditing) {
                appendLine();
            }
            return;
        case 'd':
            if (allowEditing && localLines.length > 1) {
                setShowDeleteDialog(true);
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
                <Text bold>{title ?? 'Select Line to Edit'}</Text>
                <Text dimColor>Choose which status line to configure</Text>
                <Text dimColor>
                    {allowEditing
                        ? localLines.length > 1
                            ? '(a) to append new line, (d) to delete line, ESC to go back'
                            : '(a) to append new line, ESC to go back'
                        : 'ESC to go back'}
                </Text>

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
                    initialSelection={initialSelection}
                    showBackButton={true}
                />
            </Box>
        </>
    );
};

export { LineSelector, type LineSelectorProps };