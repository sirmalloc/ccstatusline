import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import SelectInput from 'ink-select-input';
import React, { useState } from 'react';

import { getItemDefaultColor } from '../../utils/colors';
import {
    type Settings,
    type StatusItem
} from '../../utils/config';

export interface TerminalConfigMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: (target?: string) => void;
}

export const TerminalConfigMenu: React.FC<TerminalConfigMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [showColorWarning, setShowColorWarning] = useState(false);
    const [pendingColorLevel, setPendingColorLevel] = useState<0 | 1 | 2 | 3 | null>(null);
    const [highlightedValue, setHighlightedValue] = useState<string>('width');

    const menuItems = [
        { label: '📏 Terminal Width Options', value: 'width' },
        { label: `🎨 Color Level: ${getColorLevelLabel(settings.colorLevel)}`, value: 'color' },
        { label: '← Back', value: 'back' }
    ];

    const handleSelect = (selected: { value: string }) => {
        if (selected.value === 'back') {
            onBack();
        } else if (selected.value === 'width') {
            // Navigate to width options screen
            onBack('width');
        } else if (selected.value === 'color') {
            // Check if there are any custom colors that would be lost
            const hasCustomColors = settings.lines.some((line: StatusItem[]) => line.some((item: StatusItem) => Boolean(item.color && (item.color.startsWith('ansi256:') || item.color.startsWith('hex:')))
                || Boolean(item.backgroundColor && (item.backgroundColor.startsWith('ansi256:') || item.backgroundColor.startsWith('hex:')))
            )
            );

            const currentLevel = settings.colorLevel;
            const nextLevel = ((currentLevel + 1) % 4) as 0 | 1 | 2 | 3;

            // Warn if switching away from mode that supports custom colors
            if (hasCustomColors
                && ((currentLevel === 2 && nextLevel !== 2) // Switching from 256 color mode
                    || (currentLevel === 3 && nextLevel !== 3))) { // Switching from truecolor mode
                setShowColorWarning(true);
                setPendingColorLevel(nextLevel);
            } else {
                // Update chalk level immediately
                chalk.level = nextLevel;

                // Clean up incompatible custom colors even when no warning is shown
                const cleanedLines = settings.lines.map(line => line.map((item) => {
                    const newItem = { ...item };
                    // Remove custom colors incompatible with the new mode
                    if (nextLevel === 2) {
                        // Switching to 256 color mode - remove hex colors
                        if (item.color?.startsWith('hex:')) {
                            newItem.color = getItemDefaultColor(item.type);
                        }
                        if (item.backgroundColor?.startsWith('hex:')) {
                            newItem.backgroundColor = undefined;
                        }
                    } else if (nextLevel === 3) {
                        // Switching to truecolor mode - remove ansi256 colors
                        if (item.color?.startsWith('ansi256:')) {
                            newItem.color = getItemDefaultColor(item.type);
                        }
                        if (item.backgroundColor?.startsWith('ansi256:')) {
                            newItem.backgroundColor = undefined;
                        }
                    } else {
                        // Switching to 16 color mode - remove all custom colors
                        if (item.color?.startsWith('ansi256:') || item.color?.startsWith('hex:')) {
                            newItem.color = getItemDefaultColor(item.type);
                        }
                        if (item.backgroundColor?.startsWith('ansi256:') || item.backgroundColor?.startsWith('hex:')) {
                            newItem.backgroundColor = undefined;
                        }
                    }
                    return newItem;
                })
                );

                onUpdate({
                    ...settings,
                    lines: cleanedLines,
                    colorLevel: nextLevel
                });
            }
        }
    };

    useInput((input, key) => {
        if (key.escape) {
            if (showColorWarning) {
                setShowColorWarning(false);
                setPendingColorLevel(null);
            } else {
                onBack();
            }
        } else if (showColorWarning) {
            if (input === 'y' || input === 'Y') {
                // Proceed with color level change and clean up custom colors
                if (pendingColorLevel !== null) {
                    chalk.level = pendingColorLevel;

                    // Clean up custom colors if switching away from modes that support them
                    const cleanedLines = settings.lines.map(line => line.map((item) => {
                        const newItem = { ...item };
                        // Remove custom colors if switching to a mode that doesn't support them
                        if ((pendingColorLevel !== 2 && pendingColorLevel !== 3)
                            || (pendingColorLevel === 2 && (item.color?.startsWith('hex:') || item.backgroundColor?.startsWith('hex:')))
                            || (pendingColorLevel === 3 && (item.color?.startsWith('ansi256:') || item.backgroundColor?.startsWith('ansi256:')))) {
                            // Reset custom colors to defaults
                            if (item.color?.startsWith('ansi256:') || item.color?.startsWith('hex:')) {
                                newItem.color = getItemDefaultColor(item.type);
                            }
                            if (item.backgroundColor?.startsWith('ansi256:') || item.backgroundColor?.startsWith('hex:')) {
                                newItem.backgroundColor = undefined;
                            }
                        }
                        return newItem;
                    })
                    );

                    onUpdate({
                        ...settings,
                        lines: cleanedLines,
                        colorLevel: pendingColorLevel
                    });
                }
                setShowColorWarning(false);
                setPendingColorLevel(null);
            } else if (input === 'n' || input === 'N') {
                // Cancel
                setShowColorWarning(false);
                setPendingColorLevel(null);
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Terminal Configuration</Text>
            {showColorWarning ? (
                <Box flexDirection='column' marginTop={1}>
                    <Text color='yellow'>⚠️  Warning: Custom colors detected!</Text>
                    <Text>Switching color modes will reset custom ansi256 or hex colors to defaults.</Text>
                    <Text>Continue? (y/n)</Text>
                </Box>
            ) : (
                <>
                    <Text color='white'>Configure terminal-specific settings for optimal display</Text>
                    <Box marginTop={1}>
                        <SelectInput
                            items={menuItems}
                            onSelect={handleSelect}
                            onHighlight={(item) => { setHighlightedValue(item.value); }}
                            initialIndex={0}
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

                    {highlightedValue === 'color' && (
                        <Box marginTop={1} flexDirection='column'>
                            <Text dimColor>Color level affects how colors are rendered:</Text>
                            <Text dimColor>• Truecolor: Full 24-bit RGB colors (16.7M colors)</Text>
                            <Text dimColor>• 256 Color: Extended color palette (256 colors)</Text>
                            <Text dimColor>• Basic: Standard 16-color terminal palette</Text>
                            <Text dimColor>• No Color: Disables all color output</Text>
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
};

export const getColorLevelLabel = (level?: 0 | 1 | 2 | 3): string => {
    switch (level) {
    case 0: return 'No Color';
    case 1: return 'Basic';
    case 2:
    case undefined: return '256 Color (default)';
    case 3: return 'Truecolor';
    default: return '256 Color (default)';
    }
};