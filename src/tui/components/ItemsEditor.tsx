import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import {
    applyColors,
    getItemDefaultColor
} from '../../utils/colors';
import {
    type Settings,
    type StatusItem,
    type StatusItemType
} from '../../utils/config';
import { canDetectTerminalWidth } from '../utils/terminal';

export interface ItemsEditorProps {
    items: StatusItem[];
    onUpdate: (items: StatusItem[]) => void;
    onBack: () => void;
    lineNumber: number;
    settings: Settings;
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({ items, onUpdate, onBack, lineNumber, settings }) => {
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
    const getAllowedTypes = (): StatusItemType[] => {
        const allTypes: StatusItemType[] = ['model', 'git-branch', 'git-changes', 'separator',
            'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable',
            'session-clock', 'terminal-width', 'version', 'flex-separator', 'custom-text', 'custom-command'];
        
        let allowedTypes = [...allTypes];
        
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

    // Get the default type for new items (first non-separator type)
    const getDefaultItemType = (): StatusItemType => {
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
        const prevItem = insertIndex > 0 ? items[insertIndex - 1] : null;
        const nextItem = insertIndex < items.length ? items[insertIndex] : null;
        
        const prevBg = prevItem?.backgroundColor;
        const nextBg = nextItem?.backgroundColor;
        
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
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const newItems = [...items];
                    newItems[selectedIndex] = { ...currentItem, customText: textInput };
                    onUpdate(newItems);
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
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const newItems = [...items];
                    newItems[selectedIndex] = { ...currentItem, commandPath: commandInput };
                    onUpdate(newItems);
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
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const width = parseInt(maxWidthInput, 10);
                    const newItems = [...items];
                    if (!isNaN(width) && width > 0) {
                        newItems[selectedIndex] = { ...currentItem, maxWidth: width };
                    } else {
                        // Remove max width if invalid
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { maxWidth: _, ...rest } = currentItem;
                        newItems[selectedIndex] = rest;
                    }
                    onUpdate(newItems);
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
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const timeout = parseInt(timeoutInput, 10);
                    const newItems = [...items];
                    if (!isNaN(timeout) && timeout > 0) {
                        newItems[selectedIndex] = { ...currentItem, timeout: timeout };
                    } else {
                        // Remove timeout if invalid (will use default 1000ms)
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { timeout: _timeout, ...rest } = currentItem;
                        newItems[selectedIndex] = rest;
                    }
                    onUpdate(newItems);
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
                const newItems = [...items];
                const temp = newItems[selectedIndex];
                const prev = newItems[selectedIndex - 1];
                if (temp && prev) {
                    [newItems[selectedIndex], newItems[selectedIndex - 1]] = [prev, temp];
                }
                onUpdate(newItems);
                setSelectedIndex(selectedIndex - 1);
            } else if (key.downArrow && selectedIndex < items.length - 1) {
                const newItems = [...items];
                const temp = newItems[selectedIndex];
                const next = newItems[selectedIndex + 1];
                if (temp && next) {
                    [newItems[selectedIndex], newItems[selectedIndex + 1]] = [next, temp];
                }
                onUpdate(newItems);
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
                setSelectedIndex(Math.min(items.length - 1, selectedIndex + 1));
            } else if (key.leftArrow && items.length > 0) {
                // Toggle item type backwards
                const types = getAllowedTypes();
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const currentType = currentItem.type;
                    let currentIndex = types.indexOf(currentType);
                    // If current type is not in allowed types (e.g., separator when disabled), find a valid type
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }
                    const prevIndex = currentIndex === 0 ? types.length - 1 : currentIndex - 1;
                    const newItems = [...items];
                    const prevType = types[prevIndex];
                    if (prevType) {
                        newItems[selectedIndex] = { ...currentItem, type: prevType };
                        onUpdate(newItems);
                    }
                }
            } else if (key.rightArrow && items.length > 0) {
                // Toggle item type forwards
                const types = getAllowedTypes();
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const currentType = currentItem.type;
                    let currentIndex = types.indexOf(currentType);
                    // If current type is not in allowed types (e.g., separator when disabled), find a valid type
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }
                    const nextIndex = (currentIndex + 1) % types.length;
                    const newItems = [...items];
                    const nextType = types[nextIndex];
                    if (nextType) {
                        newItems[selectedIndex] = { ...currentItem, type: nextType };
                        onUpdate(newItems);
                    }
                }
            } else if (key.return && items.length > 0) {
                // Enter move mode
                setMoveMode(true);
            } else if (input === 'a') {
                // Add item after selected
                const insertIndex = items.length > 0 ? selectedIndex + 1 : 0;
                const backgroundColor = getUniqueBackgroundColor(insertIndex);
                const newItem: StatusItem = {
                    id: Date.now().toString(),
                    type: getDefaultItemType(),
                    ...(backgroundColor && { backgroundColor })
                };
                const newItems = [...items];
                newItems.splice(insertIndex, 0, newItem);
                onUpdate(newItems);
                setSelectedIndex(insertIndex); // Move selection to new item
            } else if (input === 'i') {
                // Insert item before selected
                const insertIndex = selectedIndex;
                const backgroundColor = getUniqueBackgroundColor(insertIndex);
                const newItem: StatusItem = {
                    id: Date.now().toString(),
                    type: getDefaultItemType(),
                    ...(backgroundColor && { backgroundColor })
                };
                const newItems = [...items];
                newItems.splice(insertIndex, 0, newItem);
                onUpdate(newItems);
                // Keep selection on the new item (which is now at selectedIndex)
            } else if (input === 'd' && items.length > 0) {
                // Delete selected item
                const newItems = items.filter((_, i) => i !== selectedIndex);
                onUpdate(newItems);
                if (selectedIndex >= newItems.length && selectedIndex > 0) {
                    setSelectedIndex(selectedIndex - 1);
                }
            } else if (input === 'c') {
                // Clear entire line
                onUpdate([]);
                setSelectedIndex(0);
            } else if (input === ' ' && items.length > 0) {
                // Space key - cycle separator character for separator types only (not flex)
                const currentItem = items[selectedIndex];
                if (currentItem && currentItem.type === 'separator') {
                    const currentChar = currentItem.character ?? '|';
                    const currentCharIndex = separatorChars.indexOf(currentChar);
                    const nextChar = separatorChars[(currentCharIndex + 1) % separatorChars.length];
                    const newItems = [...items];
                    newItems[selectedIndex] = { ...currentItem, character: nextChar };
                    onUpdate(newItems);
                }
            } else if (input === 'r' && items.length > 0) {
                // Toggle raw value for non-separator items
                const currentItem = items[selectedIndex];
                if (currentItem && currentItem.type !== 'separator' && currentItem.type !== 'flex-separator' && currentItem.type !== 'custom-text') {
                    const newItems = [...items];
                    newItems[selectedIndex] = { ...currentItem, rawValue: !currentItem.rawValue };
                    onUpdate(newItems);
                }
            } else if (input === 'e' && items.length > 0) {
                // Edit custom text or custom command
                const currentItem = items[selectedIndex];
                if (currentItem && currentItem.type === 'custom-text') {
                    const text = currentItem.customText ?? '';
                    setTextInput(text);
                    setTextCursorPos(text.length); // Start cursor at end
                    setEditingText(true);
                } else if (currentItem && currentItem.type === 'custom-command') {
                    const cmd = currentItem.commandPath ?? '';
                    setCommandInput(cmd);
                    setCommandCursorPos(cmd.length); // Start cursor at end
                    setEditingCommand(true);
                }
            } else if (input === 'w' && items.length > 0) {
                // Edit max width for custom command
                const currentItem = items[selectedIndex];
                if (currentItem && currentItem.type === 'custom-command') {
                    setMaxWidthInput(currentItem.maxWidth ? currentItem.maxWidth.toString() : '');
                    setEditingMaxWidth(true);
                }
            } else if (input === 't' && items.length > 0) {
                // Edit timeout for custom command
                const currentItem = items[selectedIndex];
                if (currentItem && currentItem.type === 'custom-command') {
                    setTimeoutInput(currentItem.timeout ? currentItem.timeout.toString() : '1000');
                    setEditingTimeout(true);
                }
            } else if (input === 'p' && items.length > 0) {
                // Toggle preserve colors for custom command
                const currentItem = items[selectedIndex];
                if (currentItem && currentItem.type === 'custom-command') {
                    const newItems = [...items];
                    newItems[selectedIndex] = { ...currentItem, preserveColors: !currentItem.preserveColors };
                    onUpdate(newItems);
                }
            } else if (input === 'm' && items.length > 0) {
                // Cycle through merge states: undefined -> true -> 'no-padding' -> undefined
                const currentItem = items[selectedIndex];
                // Don't allow merge on the last item or on separators
                if (currentItem && selectedIndex < items.length - 1
                    && currentItem.type !== 'separator' && currentItem.type !== 'flex-separator') {
                    const newItems = [...items];
                    let nextMergeState: boolean | 'no-padding' | undefined;

                    if (currentItem.merge === undefined) {
                        nextMergeState = true;
                    } else if (currentItem.merge === true) {
                        nextMergeState = 'no-padding';
                    } else {
                        nextMergeState = undefined;
                    }

                    if (nextMergeState === undefined) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { merge: _merge, ...rest } = currentItem;
                        newItems[selectedIndex] = rest;
                    } else {
                        newItems[selectedIndex] = { ...currentItem, merge: nextMergeState };
                    }
                    onUpdate(newItems);
                }
            } else if (key.escape) {
                onBack();
            }
        }
    });

    const getItemDisplay = (item: StatusItem) => {
        // Get the color for this item (use custom color if set, otherwise default)
        const colorName = item.color ?? getItemDefaultColor(item.type);
        const colorFunc = (chalk as unknown as Record<string, typeof chalk.white>)[colorName] ?? chalk.white;

        switch (item.type) {
        case 'model':
            return colorFunc('Model');
        case 'git-branch':
            return colorFunc('Git Branch');
        case 'git-changes':
            return colorFunc('Git Changes');
        case 'separator': {
            const char = item.character ?? '|';
            const charDisplay = char === ' ' ? '(space)' : char;
            // Apply the separator's color to its display
            return applyColors(`Separator ${charDisplay}`, item.color ?? 'gray', item.backgroundColor, item.bold);
        }
        case 'flex-separator':
            return chalk.yellow('Flex Separator');
        case 'tokens-input':
            return colorFunc('Tokens Input');
        case 'tokens-output':
            return colorFunc('Tokens Output');
        case 'tokens-cached':
            return colorFunc('Tokens Cached');
        case 'tokens-total':
            return colorFunc('Tokens Total');
        case 'context-length':
            return colorFunc('Context Length');
        case 'context-percentage':
            return colorFunc('Context %');
        case 'context-percentage-usable':
            return colorFunc('Context % (usable)');
        case 'session-clock':
            return colorFunc('Session Clock');
        case 'terminal-width':
            return colorFunc('Terminal Width');
        case 'version':
            return colorFunc('Version');
        case 'custom-text': {
            const text = item.customText ?? 'Empty';
            return colorFunc(`Custom Text (${text})`);
        }
        case 'custom-command': {
            const cmd = item.commandPath ?? 'No command';
            const truncatedCmd = cmd.length > 30 ? `${cmd.substring(0, 27)}...` : cmd;
            // Only apply color if not preserving colors
            if (!item.preserveColors) {
                return colorFunc(`Custom Command (${truncatedCmd})`);
            } else {
                return chalk.white(`Custom Command (${truncatedCmd}) [preserving colors]`);
            }
        }
        }
    };

    const hasFlexSeparator = items.some(item => item.type === 'flex-separator');
    const widthDetectionAvailable = canDetectTerminalWidth();

    // Build dynamic help text based on selected item
    const currentItem = items[selectedIndex];
    const isSeparator = currentItem?.type === 'separator';
    const isFlexSeparator = currentItem?.type === 'flex-separator';
    const isCustomText = currentItem?.type === 'custom-text';
    const isCustomCommand = currentItem?.type === 'custom-command';
    const canToggleRaw = currentItem && !isSeparator && !isFlexSeparator && !isCustomText && !isCustomCommand;
    const canMerge = currentItem && selectedIndex < items.length - 1 && !isSeparator && !isFlexSeparator;

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
            {(settings.powerline.enabled || settings.defaultSeparator) && (
                <Box marginTop={1} flexDirection='column'>
                    <Text color='yellow'>
                        ⚠ {settings.powerline.enabled 
                            ? 'Powerline mode active: separators controlled by powerline settings' 
                            : 'Default separator active: manual separators disabled'}
                    </Text>
                </Box>
            )}
            <Box marginTop={1} flexDirection='column'>
                {items.length === 0 ? (
                    <Text dimColor>No items. Press 'a' to add one.</Text>
                ) : (
                    items.map((item, index) => (
                        <Box key={item.id}>
                            <Text color={index === selectedIndex ? (moveMode ? 'yellow' : 'green') : undefined}>
                                {index === selectedIndex ? (moveMode ? '◆ ' : '▶ ') : '  '}
                                {index + 1}
                                .
                                {' '}
                                {getItemDisplay(item)}
                                {item.rawValue && <Text dimColor> (raw value)</Text>}
                                {item.merge === true && <Text dimColor> (merged→)</Text>}
                                {item.merge === 'no-padding' && <Text dimColor> (merged-no-pad→)</Text>}
                                {item.type === 'custom-command' && item.maxWidth && (
                                    <Text dimColor>
                                        {' '}
                                        (max:
                                        {item.maxWidth}
                                        )
                                    </Text>
                                )}
                                {item.type === 'custom-command' && item.preserveColors && <Text dimColor> (preserve colors)</Text>}
                            </Text>
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
};