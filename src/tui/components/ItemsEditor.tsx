import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { applyColors } from '../../utils/colors';
import {
    type Settings,
    type WidgetItem,
    type WidgetItemType
} from '../../utils/config';
import {
    getAllWidgetTypes,
    getWidget
} from '../../utils/widgets';
import { canDetectTerminalWidth } from '../utils/terminal';

export interface ItemsEditorProps {
    widgets: WidgetItem[];
    onUpdate: (widgets: WidgetItem[]) => void;
    onBack: () => void;
    lineNumber: number;
    settings: Settings;
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({ widgets, onUpdate, onBack, lineNumber, settings }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [moveMode, setMoveMode] = useState(false);
    const [editingText, setEditingText] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [textCursorPos, setTextCursorPos] = useState(0);
    const [editingCommand, setEditingCommand] = useState(false);
    const [commandInput, setCommandInput] = useState('');
    const [commandCursorPos, setCommandCursorPos] = useState(0);
    const [editingMaxWidth, setEditingMaxWidth] = useState(false);
    const [maxWidthInput, setMaxWidthInput] = useState('');
    const [editingTimeout, setEditingTimeout] = useState(false);
    const [timeoutInput, setTimeoutInput] = useState('');
    const separatorChars = ['|', '-', ',', ' '];

    // Determine which item types are allowed based on settings
    const getAllowedTypes = (): WidgetItemType[] => {
        let allowedTypes = getAllWidgetTypes(settings);

        // Remove separator if default separator is set
        if (settings.defaultSeparator) {
            allowedTypes = allowedTypes.filter(t => t !== 'separator');
        }

        // Remove both separator and flex-separator if powerline mode is enabled
        if (settings.powerline.enabled) {
            allowedTypes = allowedTypes.filter(t => t !== 'separator' && t !== 'flex-separator');
        }

        return allowedTypes;
    };

    // Get the default type for new widgets (first non-separator type)
    const getDefaultItemType = (): WidgetItemType => {
        const allowedTypes = getAllowedTypes();
        return allowedTypes.includes('model') ? 'model' : (allowedTypes[0] ?? 'model');
    };

    // Get a unique background color for powerline mode
    const getUniqueBackgroundColor = (insertIndex: number): string | undefined => {
        if (!settings.powerline.enabled) {
            return undefined;
        }

        // All available background colors (excluding black for better visibility)
        const bgColors = [
            'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite',
            'bgBrightRed', 'bgBrightGreen', 'bgBrightYellow', 'bgBrightBlue',
            'bgBrightMagenta', 'bgBrightCyan', 'bgBrightWhite'
        ];

        // Get colors of adjacent items
        const prevWidget = insertIndex > 0 ? widgets[insertIndex - 1] : null;
        const nextWidget = insertIndex < widgets.length ? widgets[insertIndex] : null;

        const prevBg = prevWidget?.backgroundColor;
        const nextBg = nextWidget?.backgroundColor;

        // Filter out colors that match neighbors
        const availableColors = bgColors.filter(color => color !== prevBg && color !== nextBg);

        // If we have available colors, pick one randomly
        if (availableColors.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableColors.length);
            return availableColors[randomIndex];
        }

        // Fallback: if somehow both neighbors use all 14 colors (impossible with 2 neighbors),
        // just pick any color that's different from the previous
        return bgColors.find(c => c !== prevBg) ?? bgColors[0];
    };

    useInput((input, key) => {
        if (editingText) {
            // In text editing mode
            if (key.return) {
                // Save the custom text
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, customText: textInput };
                    onUpdate(newWidgets);
                }
                setEditingText(false);
                setTextInput('');
                setTextCursorPos(0);
            } else if (key.escape) {
                // Cancel editing
                setEditingText(false);
                setTextInput('');
                setTextCursorPos(0);
            } else if (key.leftArrow) {
                setTextCursorPos(Math.max(0, textCursorPos - 1));
            } else if (key.rightArrow) {
                setTextCursorPos(Math.min(textInput.length, textCursorPos + 1));
            } else if (key.ctrl && input === 'ArrowLeft') {
                // Move to beginning
                setTextCursorPos(0);
            } else if (key.ctrl && input === 'ArrowRight') {
                // Move to end
                setTextCursorPos(textInput.length);
            } else if (key.backspace) {
                if (textCursorPos > 0) {
                    setTextInput(textInput.slice(0, textCursorPos - 1) + textInput.slice(textCursorPos));
                    setTextCursorPos(textCursorPos - 1);
                }
            } else if (key.delete) {
                if (textCursorPos < textInput.length) {
                    setTextInput(textInput.slice(0, textCursorPos) + textInput.slice(textCursorPos + 1));
                }
            } else if (input && input.length === 1) {
                setTextInput(textInput.slice(0, textCursorPos) + input + textInput.slice(textCursorPos));
                setTextCursorPos(textCursorPos + 1);
            }
        } else if (editingCommand) {
            // In command editing mode
            if (key.return) {
                // Save the command path
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, commandPath: commandInput };
                    onUpdate(newWidgets);
                }
                setEditingCommand(false);
                setCommandInput('');
                setCommandCursorPos(0);
            } else if (key.escape) {
                // Cancel editing
                setEditingCommand(false);
                setCommandInput('');
                setCommandCursorPos(0);
            } else if (key.leftArrow) {
                setCommandCursorPos(Math.max(0, commandCursorPos - 1));
            } else if (key.rightArrow) {
                setCommandCursorPos(Math.min(commandInput.length, commandCursorPos + 1));
            } else if (key.ctrl && input === 'ArrowLeft') {
                // Move to beginning
                setCommandCursorPos(0);
            } else if (key.ctrl && input === 'ArrowRight') {
                // Move to end
                setCommandCursorPos(commandInput.length);
            } else if (key.backspace) {
                if (commandCursorPos > 0) {
                    setCommandInput(commandInput.slice(0, commandCursorPos - 1) + commandInput.slice(commandCursorPos));
                    setCommandCursorPos(commandCursorPos - 1);
                }
            } else if (key.delete) {
                if (commandCursorPos < commandInput.length) {
                    setCommandInput(commandInput.slice(0, commandCursorPos) + commandInput.slice(commandCursorPos + 1));
                }
            } else if (input) {
                setCommandInput(commandInput.slice(0, commandCursorPos) + input + commandInput.slice(commandCursorPos));
                setCommandCursorPos(commandCursorPos + input.length);
            }
        } else if (editingMaxWidth) {
            // In max width editing mode
            if (key.return) {
                // Save the max width
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const width = parseInt(maxWidthInput, 10);
                    const newWidgets = [...widgets];
                    if (!isNaN(width) && width > 0) {
                        newWidgets[selectedIndex] = { ...currentWidget, maxWidth: width };
                    } else {
                        // Remove max width if invalid
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { maxWidth: _, ...rest } = currentWidget;
                        newWidgets[selectedIndex] = rest;
                    }
                    onUpdate(newWidgets);
                }
                setEditingMaxWidth(false);
                setMaxWidthInput('');
            } else if (key.escape) {
                // Cancel editing
                setEditingMaxWidth(false);
                setMaxWidthInput('');
            } else if (key.backspace) {
                setMaxWidthInput(maxWidthInput.slice(0, -1));
            } else if (key.delete) {
                // For simple number inputs, forward delete does nothing since there's no cursor position
            } else if (input && /\d/.test(input)) {
                setMaxWidthInput(maxWidthInput + input);
            }
        } else if (editingTimeout) {
            // In timeout editing mode
            if (key.return) {
                // Save the timeout
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const timeout = parseInt(timeoutInput, 10);
                    const newWidgets = [...widgets];
                    if (!isNaN(timeout) && timeout > 0) {
                        newWidgets[selectedIndex] = { ...currentWidget, timeout: timeout };
                    } else {
                        // Remove timeout if invalid (will use default 1000ms)
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { timeout: _timeout, ...rest } = currentWidget;
                        newWidgets[selectedIndex] = rest;
                    }
                    onUpdate(newWidgets);
                }
                setEditingTimeout(false);
                setTimeoutInput('');
            } else if (key.escape) {
                // Cancel editing
                setEditingTimeout(false);
                setTimeoutInput('');
            } else if (key.backspace) {
                setTimeoutInput(timeoutInput.slice(0, -1));
            } else if (key.delete) {
                // For simple number inputs, forward delete does nothing since there's no cursor position
            } else if (input && /\d/.test(input)) {
                setTimeoutInput(timeoutInput + input);
            }
        } else if (moveMode) {
            // In move mode, use up/down to move the selected item
            if (key.upArrow && selectedIndex > 0) {
                const newWidgets = [...widgets];
                const temp = newWidgets[selectedIndex];
                const prev = newWidgets[selectedIndex - 1];
                if (temp && prev) {
                    [newWidgets[selectedIndex], newWidgets[selectedIndex - 1]] = [prev, temp];
                }
                onUpdate(newWidgets);
                setSelectedIndex(selectedIndex - 1);
            } else if (key.downArrow && selectedIndex < widgets.length - 1) {
                const newWidgets = [...widgets];
                const temp = newWidgets[selectedIndex];
                const next = newWidgets[selectedIndex + 1];
                if (temp && next) {
                    [newWidgets[selectedIndex], newWidgets[selectedIndex + 1]] = [next, temp];
                }
                onUpdate(newWidgets);
                setSelectedIndex(selectedIndex + 1);
            } else if (key.escape || key.return) {
                // Exit move mode
                setMoveMode(false);
            }
        } else {
            // Normal mode
            if (key.upArrow) {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            } else if (key.downArrow) {
                setSelectedIndex(Math.min(widgets.length - 1, selectedIndex + 1));
            } else if (key.leftArrow && widgets.length > 0) {
                // Toggle item type backwards
                const types = getAllowedTypes();
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const currentType = currentWidget.type;
                    let currentIndex = types.indexOf(currentType);
                    // If current type is not in allowed types (e.g., separator when disabled), find a valid type
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }
                    const prevIndex = currentIndex === 0 ? types.length - 1 : currentIndex - 1;
                    const newWidgets = [...widgets];
                    const prevType = types[prevIndex];
                    if (prevType) {
                        newWidgets[selectedIndex] = { ...currentWidget, type: prevType };
                        onUpdate(newWidgets);
                    }
                }
            } else if (key.rightArrow && widgets.length > 0) {
                // Toggle item type forwards
                const types = getAllowedTypes();
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const currentType = currentWidget.type;
                    let currentIndex = types.indexOf(currentType);
                    // If current type is not in allowed types (e.g., separator when disabled), find a valid type
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }
                    const nextIndex = (currentIndex + 1) % types.length;
                    const newWidgets = [...widgets];
                    const nextType = types[nextIndex];
                    if (nextType) {
                        newWidgets[selectedIndex] = { ...currentWidget, type: nextType };
                        onUpdate(newWidgets);
                    }
                }
            } else if (key.return && widgets.length > 0) {
                // Enter move mode
                setMoveMode(true);
            } else if (input === 'a') {
                // Add widget after selected
                const insertIndex = widgets.length > 0 ? selectedIndex + 1 : 0;
                const backgroundColor = getUniqueBackgroundColor(insertIndex);
                const newWidget: WidgetItem = {
                    id: Date.now().toString(),
                    type: getDefaultItemType(),
                    ...(backgroundColor && { backgroundColor })
                };
                const newWidgets = [...widgets];
                newWidgets.splice(insertIndex, 0, newWidget);
                onUpdate(newWidgets);
                setSelectedIndex(insertIndex); // Move selection to new widget
            } else if (input === 'i') {
                // Insert item before selected
                const insertIndex = selectedIndex;
                const backgroundColor = getUniqueBackgroundColor(insertIndex);
                const newWidget: WidgetItem = {
                    id: Date.now().toString(),
                    type: getDefaultItemType(),
                    ...(backgroundColor && { backgroundColor })
                };
                const newWidgets = [...widgets];
                newWidgets.splice(insertIndex, 0, newWidget);
                onUpdate(newWidgets);
                // Keep selection on the new widget (which is now at selectedIndex)
            } else if (input === 'd' && widgets.length > 0) {
                // Delete selected item
                const newWidgets = widgets.filter((_, i) => i !== selectedIndex);
                onUpdate(newWidgets);
                if (selectedIndex >= newWidgets.length && selectedIndex > 0) {
                    setSelectedIndex(selectedIndex - 1);
                }
            } else if (input === 'c') {
                // Clear entire line
                onUpdate([]);
                setSelectedIndex(0);
            } else if (input === ' ' && widgets.length > 0) {
                // Space key - cycle separator character for separator types only (not flex)
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type === 'separator') {
                    const currentChar = currentWidget.character ?? '|';
                    const currentCharIndex = separatorChars.indexOf(currentChar);
                    const nextChar = separatorChars[(currentCharIndex + 1) % separatorChars.length];
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, character: nextChar };
                    onUpdate(newWidgets);
                }
            } else if (input === 'r' && widgets.length > 0) {
                // Toggle raw value for non-separator items
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator' && currentWidget.type !== 'custom-text') {
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, rawValue: !currentWidget.rawValue };
                    onUpdate(newWidgets);
                }
            } else if (input === 'e' && widgets.length > 0) {
                // Edit custom text or custom command
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type === 'custom-text') {
                    const text = currentWidget.customText ?? '';
                    setTextInput(text);
                    setTextCursorPos(text.length); // Start cursor at end
                    setEditingText(true);
                } else if (currentWidget && currentWidget.type === 'custom-command') {
                    const cmd = currentWidget.commandPath ?? '';
                    setCommandInput(cmd);
                    setCommandCursorPos(cmd.length); // Start cursor at end
                    setEditingCommand(true);
                }
            } else if (input === 'w' && widgets.length > 0) {
                // Edit max width for custom command
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type === 'custom-command') {
                    setMaxWidthInput(currentWidget.maxWidth ? currentWidget.maxWidth.toString() : '');
                    setEditingMaxWidth(true);
                }
            } else if (input === 't' && widgets.length > 0) {
                // Edit timeout for custom command
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type === 'custom-command') {
                    setTimeoutInput(currentWidget.timeout ? currentWidget.timeout.toString() : '1000');
                    setEditingTimeout(true);
                }
            } else if (input === 'p' && widgets.length > 0) {
                // Toggle preserve colors for custom command
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type === 'custom-command') {
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, preserveColors: !currentWidget.preserveColors };
                    onUpdate(newWidgets);
                }
            } else if (input === 'm' && widgets.length > 0) {
                // Cycle through merge states: undefined -> true -> 'no-padding' -> undefined
                const currentWidget = widgets[selectedIndex];
                // Don't allow merge on the last item or on separators
                if (currentWidget && selectedIndex < widgets.length - 1
                    && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
                    const newWidgets = [...widgets];
                    let nextMergeState: boolean | 'no-padding' | undefined;

                    if (currentWidget.merge === undefined) {
                        nextMergeState = true;
                    } else if (currentWidget.merge === true) {
                        nextMergeState = 'no-padding';
                    } else {
                        nextMergeState = undefined;
                    }

                    if (nextMergeState === undefined) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { merge: _merge, ...rest } = currentWidget;
                        newWidgets[selectedIndex] = rest;
                    } else {
                        newWidgets[selectedIndex] = { ...currentWidget, merge: nextMergeState };
                    }
                    onUpdate(newWidgets);
                }
            } else if (key.escape) {
                onBack();
            }
        }
    });

    const getWidgetDisplay = (widget: WidgetItem) => {
        // Special handling for separators (not widgets)
        if (widget.type === 'separator') {
            const char = widget.character ?? '|';
            const charDisplay = char === ' ' ? '(space)' : char;
            return applyColors(`Separator ${charDisplay}`, widget.color ?? 'gray', widget.backgroundColor, widget.bold);
        }
        if (widget.type === 'flex-separator') {
            return chalk.yellow('Flex Separator');
        }

        // Handle regular widgets
        const widgetImpl = getWidget(widget.type);
        const colorName = widget.color ?? widgetImpl.getDefaultColor();
        const colorFunc = (chalk as unknown as Record<string, typeof chalk.white>)[colorName] ?? chalk.white;

        let display = widgetImpl.getDisplayName();

        // Add special suffixes for custom widgets
        if (widget.type === 'custom-text') {
            const text = widget.customText ?? 'Empty';
            display = `${display} (${text})`;
        } else if (widget.type === 'custom-command') {
            const cmd = widget.commandPath ?? 'No command';
            const truncatedCmd = cmd.length > 30 ? `${cmd.substring(0, 27)}...` : cmd;
            if (!widget.preserveColors) {
                return colorFunc(`${display} (${truncatedCmd})`);
            } else {
                return chalk.white(`${display} (${truncatedCmd}) [preserving colors]`);
            }
        }

        return colorFunc(display);
    };

    const hasFlexSeparator = widgets.some(widget => widget.type === 'flex-separator');
    const widthDetectionAvailable = canDetectTerminalWidth();

    // Build dynamic help text based on selected item
    const currentWidget = widgets[selectedIndex];
    const isSeparator = currentWidget?.type === 'separator';
    const isFlexSeparator = currentWidget?.type === 'flex-separator';
    const isCustomText = currentWidget?.type === 'custom-text';
    const isCustomCommand = currentWidget?.type === 'custom-command';

    // Check if widget supports raw value using registry
    let canToggleRaw = false;
    if (currentWidget && !isSeparator && !isFlexSeparator) {
        try {
            const widgetImpl = getWidget(currentWidget.type);
            canToggleRaw = widgetImpl.supportsRawValue();
        } catch {
            canToggleRaw = false;
        }
    }

    const canMerge = currentWidget && selectedIndex < widgets.length - 1 && !isSeparator && !isFlexSeparator;

    let helpText = '↑↓ select, ←→ change type';
    if (isSeparator) {
        helpText += ', Space edit separator';
    }
    if (isCustomText) {
        helpText += ', (e)dit text';
    }
    if (isCustomCommand) {
        helpText += ', (e)dit cmd, (w)idth, (t)imeout, (p)reserve colors';
    }
    helpText += ', Enter to move, (a)dd, (i)nsert, (d)elete, (c)lear line';
    if (canToggleRaw) {
        helpText += ', (r)aw value';
    }
    if (canMerge) {
        helpText += ', (m)erge';
    }
    helpText += ', ESC back';

    return (
        <Box flexDirection='column'>
            <Text bold>
                Edit Line
                {lineNumber}
                {' '}
                {moveMode && <Text color='yellow'>[MOVE MODE]</Text>}
            </Text>
            {editingText ? (
                <Box flexDirection='column'>
                    <Text>
                        Enter custom text:
                        {' '}
                        {textInput.slice(0, textCursorPos)}
                        <Text backgroundColor='gray' color='black'>{textInput[textCursorPos] ?? ' '}</Text>
                        {textInput.slice(textCursorPos + 1)}
                    </Text>
                    <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
                </Box>
            ) : editingCommand ? (
                <Box flexDirection='column'>
                    <Text>
                        Enter command path:
                        {' '}
                        {commandInput.slice(0, commandCursorPos)}
                        <Text backgroundColor='gray' color='black'>{commandInput[commandCursorPos] ?? ' '}</Text>
                        {commandInput.slice(commandCursorPos + 1)}
                    </Text>
                    <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
                </Box>
            ) : editingMaxWidth ? (
                <Box flexDirection='column'>
                    <Text>
                        Enter max width (blank for no limit):
                        {maxWidthInput}
                    </Text>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : editingTimeout ? (
                <Box flexDirection='column'>
                    <Text>
                        Enter timeout in milliseconds (default 1000):
                        {timeoutInput}
                    </Text>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : moveMode ? (
                <Text dimColor>↑↓ to move item, ESC or Enter to exit move mode</Text>
            ) : (
                <Text dimColor>{helpText}</Text>
            )}
            {hasFlexSeparator && !widthDetectionAvailable && (
                <Box marginTop={1}>
                    <Text color='yellow'>⚠ Note: Terminal width detection is currently unavailable in your environment.</Text>
                    <Text dimColor>  Flex separators will act as normal separators until width detection is available.</Text>
                </Box>
            )}
            {(settings.powerline.enabled ?? settings.defaultSeparator) && (
                <Box marginTop={1} flexDirection='column'>
                    <Text color='yellow'>
                        ⚠
                        {' '}
                        {settings.powerline.enabled
                            ? 'Powerline mode active: separators controlled by powerline settings'
                            : 'Default separator active: manual separators disabled'}
                    </Text>
                </Box>
            )}
            <Box marginTop={1} flexDirection='column'>
                {widgets.length === 0 ? (
                    <Text dimColor>No items. Press 'a' to add one.</Text>
                ) : (
                    widgets.map((widget, index) => (
                        <Box key={widget.id}>
                            <Text color={index === selectedIndex ? (moveMode ? 'yellow' : 'green') : undefined}>
                                {index === selectedIndex ? (moveMode ? '◆ ' : '▶ ') : '  '}
                                {index + 1}
                                .
                                {' '}
                                {getWidgetDisplay(widget)}
                                {widget.rawValue && <Text dimColor> (raw value)</Text>}
                                {widget.merge === true && <Text dimColor> (merged→)</Text>}
                                {widget.merge === 'no-padding' && <Text dimColor> (merged-no-pad→)</Text>}
                                {widget.type === 'custom-command' && widget.maxWidth && (
                                    <Text dimColor>
                                        {' '}
                                        (max:
                                        {widget.maxWidth}
                                        )
                                    </Text>
                                )}
                                {widget.type === 'custom-command' && widget.preserveColors && <Text dimColor> (preserve colors)</Text>}
                            </Text>
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
};