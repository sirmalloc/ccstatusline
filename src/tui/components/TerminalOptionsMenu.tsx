import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';

export interface TerminalOptionsMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: (target?: string) => void;
}

export const TerminalOptionsMenu: React.FC<TerminalOptionsMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [showColorWarning, setShowColorWarning] = useState(false);
    const [pendingColorLevel, setPendingColorLevel] = useState<0 | 1 | 2 | 3 | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const handleSelect = () => {
        if (selectedIndex === 2) {
            // Back button
            onBack();
        } else if (selectedIndex === 0) {
            // Terminal Width Options
            onBack('width');
        } else if (selectedIndex === 1) {
            // Color Level
            // Check if there are any custom colors that would be lost
            const hasCustomColors = settings.lines.some((line: WidgetItem[]) => line.some((widget: WidgetItem) => Boolean(widget.color && (widget.color.startsWith('ansi256:') || widget.color.startsWith('hex:')))
                || Boolean(widget.backgroundColor && (widget.backgroundColor.startsWith('ansi256:') || widget.backgroundColor.startsWith('hex:')))
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
                const cleanedLines = settings.lines.map(line => line.map((widget) => {
                    const newWidget = { ...widget };
                    // Remove custom colors incompatible with the new mode
                    if (nextLevel === 2) {
                        // Switching to 256 color mode - remove hex colors
                        if (widget.color?.startsWith('hex:')) {
                            if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
                                const widgetImpl = getWidget(widget.type);
                                if (widgetImpl) {
                                    newWidget.color = widgetImpl.getDefaultColor();
                                }
                            }
                        }
                        if (widget.backgroundColor?.startsWith('hex:')) {
                            newWidget.backgroundColor = undefined;
                        }
                    } else if (nextLevel === 3) {
                        // Switching to truecolor mode - remove ansi256 colors
                        if (widget.color?.startsWith('ansi256:')) {
                            if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
                                const widgetImpl = getWidget(widget.type);
                                if (widgetImpl) {
                                    newWidget.color = widgetImpl.getDefaultColor();
                                }
                            }
                        }
                        if (widget.backgroundColor?.startsWith('ansi256:')) {
                            newWidget.backgroundColor = undefined;
                        }
                    } else {
                        // Switching to 16 color mode - remove all custom colors
                        if (widget.color?.startsWith('ansi256:') || widget.color?.startsWith('hex:')) {
                            if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
                                const widgetImpl = getWidget(widget.type);
                                if (widgetImpl) {
                                    newWidget.color = widgetImpl.getDefaultColor();
                                }
                            }
                        }
                        if (widget.backgroundColor?.startsWith('ansi256:') || widget.backgroundColor?.startsWith('hex:')) {
                            newWidget.backgroundColor = undefined;
                        }
                    }
                    return newWidget;
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

    const handleColorConfirm = () => {
        // Proceed with color level change and clean up custom colors
        if (pendingColorLevel !== null) {
            chalk.level = pendingColorLevel;

            // Clean up custom colors if switching away from modes that support them
            const cleanedLines = settings.lines.map(line => line.map((widget) => {
                const newWidget = { ...widget };
                // Remove custom colors if switching to a mode that doesn't support them
                if ((pendingColorLevel !== 2 && pendingColorLevel !== 3)
                    || (pendingColorLevel === 2 && (widget.color?.startsWith('hex:') || widget.backgroundColor?.startsWith('hex:')))
                    || (pendingColorLevel === 3 && (widget.color?.startsWith('ansi256:') || widget.backgroundColor?.startsWith('ansi256:')))) {
                    // Reset custom colors to defaults
                    if (widget.color?.startsWith('ansi256:') || widget.color?.startsWith('hex:')) {
                        if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
                            const widgetImpl = getWidget(widget.type);
                            if (widgetImpl) {
                                newWidget.color = widgetImpl.getDefaultColor();
                            }
                        }
                    }
                    if (widget.backgroundColor?.startsWith('ansi256:') || widget.backgroundColor?.startsWith('hex:')) {
                        newWidget.backgroundColor = undefined;
                    }
                }
                return newWidget;
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
    };

    const handleColorCancel = () => {
        setShowColorWarning(false);
        setPendingColorLevel(null);
    };

    useInput((input, key) => {
        if (key.escape) {
            if (!showColorWarning) {
                onBack();
            }
        } else if (!showColorWarning) {
            if (key.upArrow) {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            } else if (key.downArrow) {
                setSelectedIndex(Math.min(2, selectedIndex + 1));
            } else if (key.return) {
                handleSelect();
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Terminal Options</Text>
            {showColorWarning ? (
                <Box flexDirection='column' marginTop={1}>
                    <Text color='yellow'>⚠ Warning: Custom colors detected!</Text>
                    <Text>Switching color modes will reset custom ansi256 or hex colors to defaults.</Text>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            message='Continue?'
                            onConfirm={handleColorConfirm}
                            onCancel={handleColorCancel}
                            inline
                        />
                    </Box>
                </Box>
            ) : (
                <>
                    <Text color='white'>Configure terminal-specific settings for optimal display</Text>
                    <Box marginTop={1} flexDirection='column'>
                        <Box>
                            <Text color={selectedIndex === 0 ? 'green' : undefined}>
                                {selectedIndex === 0 ? '▶  ' : '   '}
                                ◱ Terminal Width
                            </Text>
                        </Box>
                        <Box>
                            <Text color={selectedIndex === 1 ? 'green' : undefined}>
                                {selectedIndex === 1 ? '▶  ' : '   '}
                                ▓ Color Level:
                                {' '}
                                {getColorLevelLabel(settings.colorLevel)}
                            </Text>
                        </Box>

                        <Box marginTop={1}>
                            <Text color={selectedIndex === 2 ? 'green' : undefined}>
                                {selectedIndex === 2 ? '▶  ' : '   '}
                                ← Back
                            </Text>
                        </Box>
                    </Box>

                    {selectedIndex === 1 && (
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