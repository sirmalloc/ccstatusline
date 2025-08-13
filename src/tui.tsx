import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import Gradient from 'ink-gradient';
import SelectInput from 'ink-select-input';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { loadSettings, saveSettings, type Settings, type StatusItem, type StatusItemType, type FlexMode, type PowerlineConfig } from './utils/config';
import { isInstalled, installStatusLine, uninstallStatusLine, getExistingStatusLine } from './utils/claude-settings';
import * as fs from 'fs';
import * as path from 'path';
import {
    renderStatusLine as renderLine,
    type RenderContext
} from './utils/renderer';
import {
    getItemDefaultColor,
    applyColors,
    getAvailableColorsForUI,
    getAvailableBackgroundColorsForUI
} from './utils/colors';
import { checkPowerlineFonts, checkPowerlineFontsAsync, installPowerlineFonts, getPowerlineStatusMessage, type PowerlineFontStatus } from './utils/powerline';

// Get package version
function getPackageVersion(): string {
    try {
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return packageJson.version || '';
    } catch {
        return '';
    }
}

// Get default color for each item type (matching ccstatusline.ts defaults)
// Re-export from shared renderer module
const getDefaultColor = getItemDefaultColor;

// Check if terminal width detection is available
function canDetectTerminalWidth(): boolean {
    try {
        // First try to get the tty of the parent process
        const tty = execSync('ps -o tty= -p $(ps -o ppid= -p $$)', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            shell: '/bin/sh'
        }).trim();

        // Check if we got a valid tty
        if (tty && tty !== '??' && tty !== '?') {
            const width = execSync(
                `stty size < /dev/${tty} | awk '{print $2}'`,
                {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    shell: '/bin/sh'
                }
            ).trim();

            const parsed = parseInt(width, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return true;
            }
        }
    } catch {
        // Try fallback
    }

    // Fallback: try tput cols
    try {
        const width = execSync('tput cols 2>/dev/null', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        const parsed = parseInt(width, 10);
        return !isNaN(parsed) && parsed > 0;
    } catch {
        return false;
    }
}

interface StatusLinePreviewProps {
    lines: StatusItem[][];
    terminalWidth: number;
    settings?: Settings;
}

const renderSingleLine = (items: StatusItem[], terminalWidth: number, widthDetectionAvailable: boolean, settings?: Settings): string => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true
    };

    return renderLine(items, settings || {}, context);
};


const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings }) => {
    const widthDetectionAvailable = React.useMemo(() => canDetectTerminalWidth(), []);

    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const renderedLines = React.useMemo(() =>
        lines.map(lineItems =>
            lineItems.length > 0 ? renderSingleLine(lineItems, terminalWidth, widthDetectionAvailable, settings) : ''
        ).filter(line => line !== ''), // Remove empty lines
    [lines, terminalWidth, widthDetectionAvailable, settings]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle="round" borderColor="gray" borderDimColor width="100%" paddingLeft={1}>
                <Text>&gt;</Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index}>  {line}{chalk.reset('')}</Text>
            ))}
        </Box>
    );
};

interface ConfirmDialogProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => {
    const items = [
        { label: '✅ Yes', value: 'yes' },
        { label: '❌ No', value: 'no' },
    ];

    return (
        <Box flexDirection='column'>
            <Text>{message}</Text>
            <Box marginTop={1}>
                <SelectInput
                    items={items}
                    onSelect={(item) => item.value === 'yes' ? onConfirm() : onCancel()}
                />
            </Box>
        </Box>
    );
};

interface LineSelectorProps {
    lines: StatusItem[][];
    onSelect: (lineIndex: number) => void;
    onBack: () => void;
}

interface LineSelectorProps {
    lines: StatusItem[][];
    onSelect: (line: number) => void;
    onBack: () => void;
    initialSelection?: number;
}

const LineSelector: React.FC<LineSelectorProps> = ({ lines, onSelect, onBack, initialSelection = 0 }) => {
    const items = [
        { label: `📝 Line 1${lines[0] && lines[0].length > 0 ? ` (${lines[0].length} items)` : ' (empty)'}`, value: 0 },
        { label: `📝 Line 2${lines[1] && lines[1].length > 0 ? ` (${lines[1].length} items)` : ' (empty)'}`, value: 1 },
        { label: `📝 Line 3${lines[2] && lines[2].length > 0 ? ` (${lines[2].length} items)` : ' (empty)'}`, value: 2 },
        { label: '← Back', value: -1 },
    ];

    const handleSelect = (item: { value: number }) => {
        if (item.value === -1) {
            onBack();
        } else {
            onSelect(item.value);
        }
    };

    // Handle ESC key
    useInput((input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Select Line to Edit</Text>
            <Text dimColor>Choose which status line to configure (up to 3 lines supported)</Text>
            <Text dimColor>Press ESC to go back</Text>
            <Box marginTop={1}>
                <SelectInput
                    items={items}
                    onSelect={handleSelect}
                    initialIndex={Math.min(initialSelection, items.length - 1)}
                    indicatorComponent={({isSelected}) => (
                        <Text>{isSelected ? '▶' : '  '}</Text>
                    )}
                    itemComponent={({isSelected, label}) => (
                        <Text color={isSelected ? 'green' : undefined}>
                            {' '}{label}
                        </Text>
                    )}
                />
            </Box>
        </Box>
    );
};

interface MainMenuProps {
    onSelect: (value: string) => void;
    isClaudeInstalled: boolean;
    hasChanges: boolean;
    initialSelection?: number;
    powerlineFontStatus: PowerlineFontStatus;
    settings: Settings | null;
}

const MainMenu: React.FC<MainMenuProps> = ({ onSelect, isClaudeInstalled, hasChanges, initialSelection = 0, powerlineFontStatus, settings }) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);
    const isPowerlineEnabled = settings?.powerline?.enabled || false;

    // Build menu structure with visual gaps
    const menuItems = [
        { label: '📝 Edit Lines', value: 'lines', selectable: true },
        { label: '🎨 Configure Colors', value: 'colors', selectable: true },
        { label: '🔤 Powerline Configuration', value: 'powerline', selectable: true },
        { label: '', value: '_gap1', selectable: false },  // Visual gap
        { label: '🔧 Global Overrides', value: 'globalOverrides', selectable: true },
        { label: '📏 Terminal Configuration', value: 'terminalConfig', selectable: true },
        { label: '', value: '_gap2', selectable: false },  // Visual gap
        { label: isClaudeInstalled ? '🗑️  Uninstall from Claude Code' : '📦 Install to Claude Code', value: 'install', selectable: true },
    ];

    if (hasChanges) {
        menuItems.push(
            { label: '💾 Save & Exit', value: 'save', selectable: true },
            { label: '❌ Exit without saving', value: 'exit', selectable: true }
        );
    } else {
        menuItems.push({ label: '🚪 Exit', value: 'exit', selectable: true });
    }

    // Get only selectable items for navigation
    const selectableItems = menuItems.filter(item => item.selectable);
    const selectableToFullIndex = new Map<number, number>();
    let selectableIdx = 0;
    menuItems.forEach((item, fullIdx) => {
        if (item.selectable) {
            selectableToFullIndex.set(selectableIdx++, fullIdx);
        }
    });

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
        } else if (key.downArrow) {
            setSelectedIndex(Math.min(selectableItems.length - 1, selectedIndex + 1));
        } else if (key.return) {
            const item = selectableItems[selectedIndex];
            if (item) {
                onSelect(item.value);
            }
        }
    });

    // Get description for selected item
    const getDescription = (value: string): string => {
        const descriptions: Record<string, string> = {
            'lines': 'Configure up to 3 status lines with various widgets like model info, git status, and token usage',
            'colors': 'Customize colors for each widget including foreground, background, and bold styling',
            'powerline': 'Install Powerline fonts for enhanced visual separators and symbols in your status line',
            'terminalWidth': 'Configure how the status line handles terminal width and flex separators',
            'globalOverrides': 'Set global padding, separators, and color overrides that apply to all widgets',
            'install': isClaudeInstalled
                ? 'Remove ccstatusline from your Claude Code settings'
                : 'Add ccstatusline to your Claude Code settings for automatic status line rendering',
            'save': 'Save all changes and exit the configuration tool',
            'exit': hasChanges
                ? 'Exit without saving your changes'
                : 'Exit the configuration tool'
        };
        return descriptions[value] || '';
    };

    const selectedItem = selectableItems[selectedIndex];
    const description = selectedItem ? getDescription(selectedItem.value) : '';

    return (
        <Box flexDirection='column'>
            <Text bold>Main Menu</Text>
            <Box marginTop={1} flexDirection='column'>
                {menuItems.map((item, idx) => {
                    if (!item.selectable && item.value.startsWith('_gap')) {
                        return <Text key={item.value}> </Text>;
                    }
                    const selectableIdx = selectableItems.indexOf(item);
                    const isSelected = selectableIdx === selectedIndex;
                    const isDisabled = 'disabled' in item && item.disabled;

                    return (
                        <Text
                            key={item.value}
                            color={isSelected && !isDisabled ? 'green' : undefined}
                            dimColor={isDisabled}
                        >
                            {isSelected && !isDisabled ? '▶ ' : '  '}{item.label}
                        </Text>
                    );
                })}
            </Box>
            {description && (
                <Box marginTop={1} paddingLeft={2}>
                    <Text dimColor wrap="wrap">{description}</Text>
                </Box>
            )}
        </Box>
    );
};

interface ItemsEditorProps {
    items: StatusItem[];
    onUpdate: (items: StatusItem[]) => void;
    onBack: () => void;
    lineNumber: number;
}

const ItemsEditor: React.FC<ItemsEditorProps> = ({ items, onUpdate, onBack, lineNumber }) => {
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
            } else if (key.ctrl && key.leftArrow) {
                // Move to beginning
                setTextCursorPos(0);
            } else if (key.ctrl && key.rightArrow) {
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
            } else if (key.ctrl && key.leftArrow) {
                // Move to beginning
                setCommandCursorPos(0);
            } else if (key.ctrl && key.rightArrow) {
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
                        const { maxWidth, ...rest } = currentItem;
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
                        const { timeout: _, ...rest } = currentItem;
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
                const types: StatusItemType[] = ['model', 'git-branch', 'git-changes', 'separator',
                    'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable',
                    'session-clock', 'terminal-width', 'version', 'flex-separator', 'custom-text', 'custom-command'];
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const currentType = currentItem.type;
                    const currentIndex = types.indexOf(currentType);
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
                const types: StatusItemType[] = ['model', 'git-branch', 'git-changes', 'separator',
                    'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable',
                    'session-clock', 'terminal-width', 'version', 'flex-separator', 'custom-text', 'custom-command'];
                const currentItem = items[selectedIndex];
                if (currentItem) {
                    const currentType = currentItem.type;
                    const currentIndex = types.indexOf(currentType);
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
                const newItem: StatusItem = {
                    id: Date.now().toString(),
                    type: 'separator',
                };
                const newItems = [...items];
                const insertIndex = items.length > 0 ? selectedIndex + 1 : 0;
                newItems.splice(insertIndex, 0, newItem);
                onUpdate(newItems);
                setSelectedIndex(insertIndex); // Move selection to new item
            } else if (input === 'i') {
                // Insert item before selected
                const newItem: StatusItem = {
                    id: Date.now().toString(),
                    type: 'separator',
                };
                const newItems = [...items];
                newItems.splice(selectedIndex, 0, newItem);
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
                    const currentChar = currentItem.character || '|';
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
                    const text = currentItem.customText || '';
                    setTextInput(text);
                    setTextCursorPos(text.length); // Start cursor at end
                    setEditingText(true);
                } else if (currentItem && currentItem.type === 'custom-command') {
                    const cmd = currentItem.commandPath || '';
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
            } else if (key.escape) {
                onBack();
            }
        }
    });


    const getItemDisplay = (item: StatusItem) => {
        // Get the color for this item (use custom color if set, otherwise default)
        const colorName = item.color || getDefaultColor(item.type);
        const colorFunc = (chalk as any)[colorName] || chalk.white;

        switch (item.type) {
            case 'model':
                return colorFunc('Model');
            case 'git-branch':
                return colorFunc('Git Branch');
            case 'git-changes':
                return colorFunc('Git Changes');
            case 'separator': {
                const char = item.character || '|';
                const charDisplay = char === ' ' ? '(space)' : char;
                // Apply the separator's color to its display
                return applyColors(`Separator ${charDisplay}`, item.color || 'gray', item.backgroundColor, item.bold);
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
            case 'custom-text':
                const text = item.customText || 'Empty';
                return colorFunc(`Custom Text (${text})`);
            case 'custom-command':
                const cmd = item.commandPath || 'No command';
                const truncatedCmd = cmd.length > 30 ? `${cmd.substring(0, 27)}...` : cmd;
                // Only apply color if not preserving colors
                if (!item.preserveColors) {
                    return colorFunc(`Custom Command (${truncatedCmd})`);
                } else {
                    return chalk.white(`Custom Command (${truncatedCmd}) [preserving colors]`);
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
    helpText += ', ESC back';

    return (
        <Box flexDirection='column'>
            <Text bold>Edit Line {lineNumber} {moveMode && <Text color='yellow'>[MOVE MODE]</Text>}</Text>
            {editingText ? (
                <Box flexDirection='column'>
                    <Text>
                        Enter custom text: {textInput.slice(0, textCursorPos)}
                        <Text backgroundColor="gray" color="black">{textInput[textCursorPos] || ' '}</Text>
                        {textInput.slice(textCursorPos + 1)}
                    </Text>
                    <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
                </Box>
            ) : editingCommand ? (
                <Box flexDirection='column'>
                    <Text>
                        Enter command path: {commandInput.slice(0, commandCursorPos)}
                        <Text backgroundColor="gray" color="black">{commandInput[commandCursorPos] || ' '}</Text>
                        {commandInput.slice(commandCursorPos + 1)}
                    </Text>
                    <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
                </Box>
            ) : editingMaxWidth ? (
                <Box flexDirection='column'>
                    <Text>Enter max width (blank for no limit): {maxWidthInput}</Text>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : editingTimeout ? (
                <Box flexDirection='column'>
                    <Text>Enter timeout in milliseconds (default 1000): {timeoutInput}</Text>
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
            <Box marginTop={1} flexDirection='column'>
                {items.length === 0 ? (
                    <Text dimColor>No items. Press 'a' to add one.</Text>
                ) : (
                    items.map((item, index) => (
                        <Box key={item.id}>
                            <Text color={index === selectedIndex ? (moveMode ? 'yellow' : 'green') : undefined}>
                                {index === selectedIndex ? (moveMode ? '◆ ' : '▶ ') : '  '}
                                {index + 1}. {getItemDisplay(item)}
                                {item.rawValue && <Text dimColor> (raw value)</Text>}
                                {item.type === 'custom-command' && item.maxWidth && <Text dimColor> (max: {item.maxWidth})</Text>}
                                {item.type === 'custom-command' && item.preserveColors && <Text dimColor> (preserve colors)</Text>}
                            </Text>
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
};

interface ColorMenuProps {
    items: StatusItem[];
    settings: Settings;
    onUpdate: (items: StatusItem[]) => void;
    onBack: () => void;
}

const ColorMenu: React.FC<ColorMenuProps> = ({ items, settings, onUpdate, onBack }) => {
    const [showSeparators, setShowSeparators] = useState(false);
    const [hexInputMode, setHexInputMode] = useState(false);
    const [hexInput, setHexInput] = useState('');
    const [ansi256InputMode, setAnsi256InputMode] = useState(false);
    const [ansi256Input, setAnsi256Input] = useState('');

    const colorableItems = items.filter(item => {
        // Include separators only if showSeparators is true
        if (item.type === 'separator') {
            return showSeparators;
        }
        return ['model', 'git-branch', 'git-changes', 'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable', 'session-clock', 'terminal-width', 'version', 'custom-text', 'custom-command'].includes(item.type) &&
            !(item.type === 'custom-command' && item.preserveColors); // Exclude custom-command items with preserveColors
    });
    const [highlightedItemId, setHighlightedItemId] = useState<string | null>(colorableItems[0]?.id || null);
    const [editingBackground, setEditingBackground] = useState(false);


    // Handle keyboard input
    const hasNoItems = colorableItems.length === 0;
    useInput((input, key) => {
        // If no items, any key goes back
        if (hasNoItems) {
            onBack();
            return;
        }

        // Handle hex input mode
        if (hexInputMode) {
            // Disable arrow keys in input mode
            if (key.upArrow || key.downArrow) {
                return;
            }
            if (key.escape) {
                setHexInputMode(false);
                setHexInput('');
            } else if (key.return) {
                // Validate and apply the hex color
                if (hexInput.length === 6) {
                    const hexColor = `hex:${hexInput}`;
                    const selectedItem = colorableItems.find(item => item.id === highlightedItemId);
                    if (selectedItem) {
                        // IMPORTANT: Update ALL items (not just colorableItems) to maintain proper indexing
                        const newItems = items.map(item => {
                            if (item.id === highlightedItemId) {
                                if (editingBackground) {
                                    return { ...item, backgroundColor: hexColor };
                                } else {
                                    return { ...item, color: hexColor };
                                }
                            }
                            return item;
                        });
                        onUpdate(newItems);
                    }
                    setHexInputMode(false);
                    setHexInput('');
                }
            } else if (key.backspace || key.delete) {
                setHexInput(hexInput.slice(0, -1));
            } else if (input && hexInput.length < 6) {
                // Only accept hex characters (0-9, A-F, a-f)
                const upperInput = input.toUpperCase();
                if (/^[0-9A-F]$/.test(upperInput)) {
                    setHexInput(hexInput + upperInput);
                }
            }
            return;
        }

        // Handle ansi256 input mode
        if (ansi256InputMode) {
            // Disable arrow keys in input mode
            if (key.upArrow || key.downArrow) {
                return;
            }
            if (key.escape) {
                setAnsi256InputMode(false);
                setAnsi256Input('');
            } else if (key.return) {
                // Validate and apply the ansi256 color
                const code = parseInt(ansi256Input, 10);
                if (!isNaN(code) && code >= 0 && code <= 255) {
                    const ansiColor = `ansi256:${code}`;

                    const selectedItem = colorableItems.find(item => item.id === highlightedItemId);

                    if (selectedItem) {
                        // IMPORTANT: Update ALL items (not just colorableItems) to maintain proper indexing
                        const newItems = items.map(item => {
                            if (item.id === highlightedItemId) {
                                if (editingBackground) {
                                    return { ...item, backgroundColor: ansiColor };
                                } else {
                                    return { ...item, color: ansiColor };
                                }
                            }
                            return item;
                        });

                        onUpdate(newItems);
                        setAnsi256InputMode(false);
                        setAnsi256Input('');
                    }
                }
            } else if (key.backspace || key.delete) {
                setAnsi256Input(ansi256Input.slice(0, -1));
            } else if (input && ansi256Input.length < 3) {
                // Only accept numeric characters (0-9)
                if (/^[0-9]$/.test(input)) {
                    const newInput = ansi256Input + input;
                    const code = parseInt(newInput, 10);
                    // Only allow if it won't exceed 255
                    if (code <= 255) {
                        setAnsi256Input(newInput);
                    }
                }
            }
            return;
        }

        // Ignore number keys to prevent SelectInput numerical navigation
        if (input && /^[0-9]$/.test(input)) {
            return;
        }

        // Normal keyboard handling when there are items
        if (key.escape) {
            if (editingBackground) {
                setEditingBackground(false);
            } else {
                onBack();
            }
        } else if (input === 'h' || input === 'H') {
            // Enter hex input mode (only in truecolor mode)
            if (highlightedItemId && highlightedItemId !== 'back' && settings.colorLevel === 3) {
                setHexInputMode(true);
                setHexInput('');
            }
        } else if (input === 'a' || input === 'A') {
            // Enter ansi256 input mode (only in 256 color mode)
            if (highlightedItemId && highlightedItemId !== 'back' && settings.colorLevel === 2) {
                setAnsi256InputMode(true);
                setAnsi256Input('');
            }
        } else if (input === 's' || input === 'S') {
            // Toggle show separators
            setShowSeparators(!showSeparators);
            // Reset highlight to first item if there are items
            const newColorableItems = items.filter(item => {
                if (item.type === 'separator') {
                    return !showSeparators; // Will be toggled
                }
                return ['model', 'git-branch', 'git-changes', 'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable', 'session-clock', 'terminal-width', 'version', 'custom-text', 'custom-command'].includes(item.type) &&
                    !(item.type === 'custom-command' && item.preserveColors);
            });
            if (newColorableItems.length > 0) {
                setHighlightedItemId(newColorableItems[0]!.id);
            }
        } else if (input === 'f' || input === 'F') {
            if (colorableItems.length > 0) {
                setEditingBackground(!editingBackground);
            }
        } else if (input === 'b' || input === 'B') {
            if (highlightedItemId && highlightedItemId !== 'back') {
                // Toggle bold for the highlighted item
                const selectedItem = colorableItems.find(item => item.id === highlightedItemId);
                if (selectedItem) {
                    const newItems = items.map(item => {
                        if (item.id === selectedItem.id) {
                            return { ...item, bold: !item.bold };
                        }
                        return item;
                    });
                    onUpdate(newItems);
                }
            }
        } else if (input === 'r' || input === 'R') {
            if (highlightedItemId && highlightedItemId !== 'back') {
                // Reset all styling (color, background, and bold) for the highlighted item
                const selectedItem = colorableItems.find(item => item.id === highlightedItemId);
                if (selectedItem) {
                    const newItems = items.map(item => {
                        if (item.id === selectedItem.id) {
                            // Remove color, backgroundColor, and bold properties
                            const { color, backgroundColor, bold, ...restItem } = item;
                            return restItem;
                        }
                        return item;
                    });
                    onUpdate(newItems);
                }
            }
        }
    });

    if (hasNoItems) {
        return (
            <Box flexDirection='column'>
                <Text bold>Configure Colors</Text>
                <Box marginTop={1}><Text dimColor>No colorable items in the status line.</Text></Box>
                <Text dimColor>Add a Model or Git Branch item first.</Text>
                <Box marginTop={1}><Text>Press any key to go back...</Text></Box>
            </Box>
        );
    }

    const getItemLabel = (item: StatusItem) => {
        switch (item.type) {
            case 'model': return 'Model';
            case 'git-branch': return 'Git Branch';
            case 'git-changes': return 'Git Changes';
            case 'tokens-input': return 'Tokens Input';
            case 'tokens-output': return 'Tokens Output';
            case 'tokens-cached': return 'Tokens Cached';
            case 'tokens-total': return 'Tokens Total';
            case 'context-length': return 'Context Length';
            case 'context-percentage': return 'Context Percentage';
            case 'context-percentage-usable': return 'Context % (usable)';
            case 'session-clock': return 'Session Clock';
            case 'terminal-width': return 'Terminal Width';
            case 'version': return 'Version';
            case 'separator': return `Separator (${item.character || '|'})`;
            case 'custom-text': return `Custom Text (${item.customText || 'Empty'})`;
            case 'custom-command': {
                const cmd = item.commandPath ? item.commandPath.substring(0, 20) + (item.commandPath.length > 20 ? '...' : '') : 'No command';
                const timeout = item.timeout ? ` ${item.timeout}ms` : '';
                return `Custom Command (${cmd}${timeout})`;
            }
            case 'separator': {
                const char = item.character || '|';
                const charDisplay = char === ' ' ? '(space)' : char;
                return `Separator ${charDisplay}`;
            }
            default: return item.type;
        }
    };

    // Create menu items with colored labels
    const menuItems = colorableItems.map((item, index) => {
        const label = `${index + 1}: ${getItemLabel(item)}`;
        // Apply both foreground and background colors
        const styledLabel = applyColors(label, item.color || getDefaultColor(item.type), item.backgroundColor, item.bold);
        return {
            label: styledLabel,
            value: item.id,
        };
    });
    menuItems.push({ label: '← Back', value: 'back' });

    const handleSelect = (selected: { value: string }) => {
        if (selected.value === 'back') {
            onBack();
        } else {
            // Cycle through colors
            const newItems = items.map(item => {
                if (item.id === selected.value) {
                    if (editingBackground) {
                        const currentBgColor = item.backgroundColor || '';  // Empty string for 'none'
                        let currentBgColorIndex = bgColors.indexOf(currentBgColor);
                        // If color not found, start from beginning
                        if (currentBgColorIndex === -1) currentBgColorIndex = 0;
                        const nextBgColor = bgColors[(currentBgColorIndex + 1) % bgColors.length];
                        return { ...item, backgroundColor: nextBgColor === '' ? undefined : nextBgColor };
                    } else {
                        let currentColor = item.color || getDefaultColor(item.type);
                        // If color is 'dim', treat as if no color was set
                        if (currentColor === 'dim') {
                            currentColor = getDefaultColor(item.type);
                        }
                        let currentColorIndex = colors.indexOf(currentColor);
                        // If color not found, start from beginning
                        if (currentColorIndex === -1) currentColorIndex = 0;
                        const nextColor = colors[(currentColorIndex + 1) % colors.length];
                        return { ...item, color: nextColor };
                    }
                }
                return item;
            });
            onUpdate(newItems);
        }
    };

    const handleHighlight = (item: { value: string }) => {
        setHighlightedItemId(item.value);
    };

    // Color list for cycling
    // Get available colors from colors.ts
    const colorOptions = getAvailableColorsForUI();
    const colors = colorOptions.map(c => c.value || '');

    // For background, get background colors
    const bgColorOptions = getAvailableBackgroundColorsForUI();
    const bgColors = bgColorOptions.map(c => c.value || '');

    // Get current color for highlighted item
    const selectedItem = highlightedItemId && highlightedItemId !== 'back'
        ? colorableItems.find(item => item.id === highlightedItemId)
        : null;
    const currentColor = editingBackground
        ? (selectedItem?.backgroundColor || '')  // Empty string for 'none'
        : (selectedItem ? (selectedItem.color || getDefaultColor(selectedItem.type)) : 'white');

    const colorList = editingBackground ? bgColors : colors;
    const colorIndex = colorList.indexOf(currentColor);
    const isCustom = currentColor && colorIndex === -1;
    const colorNumber = colorIndex === -1 ? 'custom' : colorIndex + 1;

    let colorDisplay;
    if (editingBackground) {
        if (!currentColor || currentColor === '') {
            colorDisplay = chalk.gray('(no background)');
        } else {
            // Determine display name based on format
            let displayName;
            if (currentColor.startsWith('ansi256:')) {
                displayName = `ANSI ${currentColor.substring(8)}`;
            } else if (currentColor.startsWith('hex:')) {
                displayName = `#${currentColor.substring(4)}`;
            } else {
                const colorOption = bgColorOptions.find(c => c.value === currentColor);
                displayName = colorOption ? colorOption.name : currentColor;
            }

            // Apply the color using our applyColors function with the current colorLevel
            const colorLevel = settings.colorLevel ?? 2;
            const colorLevelMap: { [key: number]: 'ansi16' | 'ansi256' | 'truecolor' } = {
                0: 'ansi16',
                1: 'ansi16',
                2: 'ansi256',
                3: 'truecolor'
            };
            const level = colorLevelMap[colorLevel] || 'ansi256';
            colorDisplay = applyColors(` ${displayName} `, undefined, currentColor, false, level);
        }
    } else {
        if (!currentColor || currentColor === '') {
            colorDisplay = chalk.gray('(default)');
        } else {
            // Determine display name based on format
            let displayName;
            if (currentColor.startsWith('ansi256:')) {
                displayName = `ANSI ${currentColor.substring(8)}`;
            } else if (currentColor.startsWith('hex:')) {
                displayName = `#${currentColor.substring(4)}`;
            } else {
                const colorOption = colorOptions.find(c => c.value === currentColor);
                displayName = colorOption ? colorOption.name : currentColor;
            }

            // Apply the color using our applyColors function with the current colorLevel
            const colorLevel = settings.colorLevel ?? 2;
            const colorLevelMap: { [key: number]: 'ansi16' | 'ansi256' | 'truecolor' } = {
                0: 'ansi16',
                1: 'ansi16',
                2: 'ansi256',
                3: 'truecolor'
            };
            const level = colorLevelMap[colorLevel] || 'ansi256';
            colorDisplay = applyColors(displayName, currentColor, undefined, false, level);
        }
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Configure Colors {editingBackground && chalk.yellow('[Background Mode]')}</Text>
            {hexInputMode ? (
                <Box flexDirection='column'>
                    <Text>Enter 6-digit hex color code (without #):</Text>
                    <Text>
                        #{hexInput}
                        <Text dimColor>{hexInput.length < 6 ? '_'.repeat(6 - hexInput.length) : ''}</Text>
                    </Text>
                    <Text> </Text>
                    <Text dimColor>Press Enter when done, ESC to cancel</Text>
                </Box>
            ) : ansi256InputMode ? (
                <Box flexDirection='column'>
                    <Text>Enter ANSI 256 color code (0-255):</Text>
                    <Text>
                        {ansi256Input}
                        <Text dimColor>{ansi256Input.length === 0 ? '___' : ansi256Input.length === 1 ? '__' : ansi256Input.length === 2 ? '_' : ''}</Text>
                    </Text>
                    <Text> </Text>
                    <Text dimColor>Press Enter when done, ESC to cancel</Text>
                </Box>
            ) : (
                <>
                    <Text dimColor>
                        ↑↓ to select, Enter to cycle {editingBackground ? 'background' : 'foreground'}, (f) to toggle bg/fg, (b)old,{settings.colorLevel === 3 ? ' (h)ex,' : settings.colorLevel === 2 ? ' (a)nsi256,' : ''} (r)eset, ESC to go back
                    </Text>
                    <Text dimColor>(s)how separators: {showSeparators ? chalk.green('ON') : chalk.gray('OFF')}</Text>
                    {selectedItem ? (
                        <Box marginTop={1}>
                            <Text>
                                Current {editingBackground ? 'background' : 'foreground'} ({colorNumber === 'custom' ? 'custom' : `${colorNumber}/${colorList.length}`}): {colorDisplay}
                                {selectedItem.bold && chalk.bold(' [BOLD]')}
                            </Text>
                        </Box>
                    ) : (
                        <Box marginTop={1}>
                            <Text> </Text>
                        </Box>
                    )}
                </>
            )}
            <Box marginTop={1}>
                {(hexInputMode || ansi256InputMode) ? (
                    // Static list when in input mode - no keyboard interaction
                    <Box flexDirection="column">
                        {menuItems.map((item, index) => (
                            <Text
                                key={item.value}
                                color={item.value === highlightedItemId ? 'cyan' : 'white'}
                                bold={item.value === highlightedItemId}
                            >
                                {item.value === highlightedItemId ? '▶ ' : '  '}{item.label}
                            </Text>
                        ))}
                    </Box>
                ) : (
                    // Interactive SelectInput when not in input mode
                    <SelectInput
                        items={menuItems}
                        onSelect={handleSelect}
                        onHighlight={handleHighlight}
                        initialIndex={menuItems.findIndex(item => item.value === highlightedItemId) || 0}
                    />
                )}
            </Box>
            <Box marginTop={1} flexDirection='column'>
                <Text color='yellow'>⚠ VSCode Users: </Text>
                <Text dimColor wrap='wrap'>If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.</Text>
            </Box>
        </Box>
    );
};

interface TerminalConfigMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: (target?: string) => void;
}

const TerminalConfigMenu: React.FC<TerminalConfigMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [showColorWarning, setShowColorWarning] = useState(false);
    const [pendingColorLevel, setPendingColorLevel] = useState<0 | 1 | 2 | 3 | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const menuItems = [
        { label: '📏 Terminal Width Options', value: 'width', selectable: true },
        { label: `🎨 Color Level: ${getColorLevelLabel(settings.colorLevel)}`, value: 'color', selectable: true },
        { label: '', value: '_gap', selectable: false },
        { label: '← Back', value: 'back', selectable: true },
    ];

    // Filter selectable items for navigation
    const selectableItems = menuItems.filter(item => item.selectable);
    const actualIndex = menuItems.findIndex(item => item === selectableItems[selectedIndex]);

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => (prev - 1 + selectableItems.length) % selectableItems.length);
        } else if (key.downArrow) {
            setSelectedIndex((prev) => (prev + 1) % selectableItems.length);
        } else if (key.return) {
            const selectedItem = selectableItems[selectedIndex];
            if (!selectedItem) return;

            if (selectedItem.value === 'back') {
                onBack();
            } else if (selectedItem.value === 'width') {
                // Navigate to width options screen
                onBack('width');
            } else if (selectedItem.value === 'color') {
                // Check if there are any custom colors that would be lost
                const hasCustomColors = settings.lines?.some((line: StatusItem[]) =>
                    line.some((item: StatusItem) =>
                        (item.color && (item.color.startsWith('ansi256:') || item.color.startsWith('hex:'))) ||
                        (item.backgroundColor && (item.backgroundColor.startsWith('ansi256:') || item.backgroundColor.startsWith('hex:')))
                    )
                ) || false;

                const currentLevel = settings.colorLevel ?? 2;
                const nextLevel = ((currentLevel + 1) % 4) as 0 | 1 | 2 | 3;

                // Warn if switching away from mode that supports custom colors
                if (hasCustomColors &&
                    ((currentLevel === 2 && nextLevel !== 2) || // Switching from 256 color mode
                     (currentLevel === 3 && nextLevel !== 3))) { // Switching from truecolor mode
                    setShowColorWarning(true);
                    setPendingColorLevel(nextLevel);
                } else {
                    // Update chalk level immediately
                    chalk.level = nextLevel;

                    // Clean up incompatible custom colors even when no warning is shown
                    const cleanedLines = settings.lines?.map(line =>
                        line.map(item => {
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
                            } else if (nextLevel === 0 || nextLevel === 1) {
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
                    ) || settings.lines;

                    onUpdate({
                        ...settings,
                        lines: cleanedLines,
                        colorLevel: nextLevel
                    });
                }
            }
        } else if (key.escape) {
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
                    const cleanedLines = settings.lines?.map(line =>
                        line.map(item => {
                            const newItem = { ...item };
                            // Remove custom colors if switching to a mode that doesn't support them
                            if ((pendingColorLevel !== 2 && pendingColorLevel !== 3) ||
                                (pendingColorLevel === 2 && (item.color?.startsWith('hex:') || item.backgroundColor?.startsWith('hex:'))) ||
                                (pendingColorLevel === 3 && (item.color?.startsWith('ansi256:') || item.backgroundColor?.startsWith('ansi256:')))) {

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
                    ) || settings.lines;

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
                    <Text color="white">Configure terminal-specific settings for optimal display</Text>
                    <Box marginTop={1} flexDirection='column'>
                        {menuItems.map((item, index) => {
                            const isSelected = index === actualIndex;
                            if (!item.selectable) {
                                return <Text key={index}>{item.label}</Text>;
                            }
                            return (
                                <Text
                                    key={index}
                                    color={isSelected ? 'cyan' : 'white'}
                                    bold={isSelected}
                                >
                                    {isSelected ? '> ' : '  '}{item.label}
                                </Text>
                            );
                        })}
                    </Box>

                    {selectableItems[selectedIndex]?.value === 'color' && (
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

const getColorLevelLabel = (level?: 0 | 1 | 2 | 3): string => {
    switch (level) {
        case 0: return 'No Color';
        case 1: return 'Basic';
        case 2:
        case undefined: return '256 Color (default)';
        case 3: return 'Truecolor';
        default: return '256 Color (default)';
    }
};

interface TerminalWidthOptionsProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

const TerminalWidthOptions: React.FC<TerminalWidthOptionsProps> = ({ settings, onUpdate, onBack }) => {
    const [selectedOption, setSelectedOption] = useState<FlexMode>(settings.flexMode || 'full-minus-40');
    const [compactThreshold, setCompactThreshold] = useState(settings.compactThreshold || 60);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdInput, setThresholdInput] = useState(String(settings.compactThreshold || 60));
    const [validationError, setValidationError] = useState<string | null>(null);
    const [highlightedOption, setHighlightedOption] = useState<FlexMode>(settings.flexMode || 'full-minus-40');

    useInput((input, key) => {
        if (editingThreshold) {
            if (key.return) {
                const value = parseInt(thresholdInput, 10);
                if (isNaN(value)) {
                    setValidationError('Please enter a valid number');
                } else if (value < 1 || value > 99) {
                    setValidationError(`Value must be between 1 and 99 (you entered ${value})`);
                } else {
                    setCompactThreshold(value);
                    // Update settings with both flexMode and the new threshold
                    const updatedSettings = {
                        ...settings,
                        flexMode: selectedOption,
                        compactThreshold: value
                    };
                    onUpdate(updatedSettings);
                    setEditingThreshold(false);
                    setValidationError(null);
                }
            } else if (key.escape) {
                setThresholdInput(String(compactThreshold));
                setEditingThreshold(false);
                setValidationError(null);
            } else if (key.backspace) {
                setThresholdInput(thresholdInput.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // For simple number inputs, forward delete does nothing since there's no cursor position
            } else if (input && /\d/.test(input)) {
                const newValue = thresholdInput + input;
                if (newValue.length <= 2) {
                    setThresholdInput(newValue);
                    setValidationError(null);
                }
            }
        } else {
            if (key.escape) {
                onBack();
            }
        }
    });

    const options = [
        {
            value: 'full' as FlexMode,
            label: 'Full width always',
            description: 'Uses the full terminal width minus 4 characters for terminal padding. If the auto-compact message appears, it may cause the line to wrap. This is due to a limitation where we cannot accurately detect the available width.\n\nNOTE: If /ide integration is enabled, it\'s not recommended to use this mode as stuff like opening a file will cause text to appear on the right of the terminal that will force the status line to wrap.'
        },
        {
            value: 'full-minus-40' as FlexMode,
            label: 'Full width minus 40 (default)',
            description: 'Leaves a gap to the right of the status line to accommodate the auto-compact message. This prevents wrapping but may leave unused space. This limitation exists because we cannot detect when the message will appear.'
        },
        {
            value: 'full-until-compact' as FlexMode,
            label: 'Full width until compact',
            description: `Dynamically adjusts width based on context usage. When context reaches ${compactThreshold}%, it switches to leaving space for the auto-compact message. This provides a balance but requires guessing when the message appears.\n\nNOTE: If /ide integration is enabled, it's not recommended to use this mode as stuff like opening a file will cause text to appear on the right of the terminal that will force the status line to wrap.`
        }
    ];

    const handleSelect = (item: { value: string }) => {
        const mode = item.value as FlexMode;
        setSelectedOption(mode);

        // Always update both flexMode and compactThreshold together
        const updatedSettings = {
            ...settings,
            flexMode: mode,
            compactThreshold: compactThreshold
        };
        onUpdate(updatedSettings);

        if (mode === 'full-until-compact') {
            // Prompt for threshold editing
            setEditingThreshold(true);
        }
    };

    const menuItems = options.map(opt => ({
        label: opt.label + (opt.value === selectedOption ? ' ✓' : ''),
        value: opt.value as string
    }));
    menuItems.push({ label: '← Back', value: 'back' });

    const currentOption = options.find(o => o.value === highlightedOption);

    return (
        <Box flexDirection='column'>
            <Text bold>Terminal Width Options</Text>
            <Text color="white">These settings affect where long lines are truncated, and where right-alignment occurs when using flex separators</Text>
            <Text dimColor wrap="wrap">These settings are necessary because claude code does not currently provide an available width variable for the statusline and features like IDE integration, auto-compaction notices, and rate limit messages can all cause the statusline to wrap if we do not truncate it</Text>

            {editingThreshold ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>Enter compact threshold (1-99): {thresholdInput}%</Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>Press Enter to confirm, ESC to cancel</Text>
                    )}
                </Box>
            ) : (
                <>
                    <Box marginTop={1}>
                        <SelectInput
                            items={menuItems}
                            initialIndex={options.findIndex(o => o.value === selectedOption)}
                            onHighlight={(item) => {
                                if (item.value !== 'back') {
                                    setHighlightedOption(item.value as FlexMode);
                                }
                            }}
                            onSelect={(item) => {
                                if (item.value === 'back') {
                                    onBack();
                                } else {
                                    handleSelect(item);
                                }
                            }}
                            indicatorComponent={({isSelected}) => (
                                <Text>{isSelected ? '▶' : '  '}</Text>
                            )}
                            itemComponent={({isSelected, label}) => (
                                <Text color={isSelected ? 'green' : undefined}>
                                    {' '}{label}
                                </Text>
                            )}
                        />
                    </Box>

                    {currentOption && (
                        <Box marginTop={1} marginBottom={1} borderStyle='round' borderColor='dim' paddingX={1}>
                            <Box flexDirection='column'>
                                <Text>
                                    <Text color='yellow'>{currentOption.label}</Text>
                                    {highlightedOption === 'full-until-compact' && ` | Current threshold: ${compactThreshold}%`}
                                </Text>
                                <Text dimColor wrap='wrap'>{currentOption.description}</Text>
                            </Box>
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
};

interface GlobalOverridesMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

const GlobalOverridesMenu: React.FC<GlobalOverridesMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [editingPadding, setEditingPadding] = useState(false);
    const [editingSeparator, setEditingSeparator] = useState(false);
    const [paddingInput, setPaddingInput] = useState(settings.defaultPadding || '');
    const [separatorInput, setSeparatorInput] = useState(settings.defaultSeparator || '');
    const [inheritColors, setInheritColors] = useState(settings.inheritSeparatorColors || false);
    const [globalBold, setGlobalBold] = useState(settings.globalBold || false);
    const isPowerlineEnabled = settings.powerline?.enabled || false;

    // Background color override
    const bgColors = ['none', 'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta',
        'bgCyan', 'bgWhite', 'bgGray', 'bgRedBright', 'bgGreenBright', 'bgYellowBright',
        'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright'];
    const currentBgIndex = bgColors.indexOf(settings.overrideBackgroundColor || 'none');

    // Foreground color override
    const fgColors = ['none', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'gray', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
        'magentaBright', 'cyanBright', 'whiteBright'];
    const currentFgIndex = fgColors.indexOf(settings.overrideForegroundColor || 'none');

    useInput((input, key) => {
        if (editingPadding) {
            if (key.return) {
                const updatedSettings = {
                    ...settings,
                    defaultPadding: paddingInput
                };
                onUpdate(updatedSettings);
                setEditingPadding(false);
            } else if (key.escape) {
                setPaddingInput(settings.defaultPadding || '');
                setEditingPadding(false);
            } else if (key.backspace) {
                setPaddingInput(paddingInput.slice(0, -1));
            } else if (key.delete) {
                // For simple text inputs without cursor, forward delete does nothing
            } else if (input) {
                setPaddingInput(paddingInput + input);
            }
        } else if (editingSeparator) {
            if (key.return) {
                const updatedSettings = {
                    ...settings,
                    defaultSeparator: separatorInput
                };
                onUpdate(updatedSettings);
                setEditingSeparator(false);
            } else if (key.escape) {
                setSeparatorInput(settings.defaultSeparator || '');
                setEditingSeparator(false);
            } else if (key.backspace) {
                setSeparatorInput(separatorInput.slice(0, -1));
            } else if (key.delete) {
                // For simple text inputs without cursor, forward delete does nothing
            } else if (input) {
                setSeparatorInput(separatorInput + input);
            }
        } else {
            if (key.escape) {
                onBack();
            } else if (input === 'p' || input === 'P') {
                setEditingPadding(true);
            } else if ((input === 's' || input === 'S') && !isPowerlineEnabled) {
                setEditingSeparator(true);
            } else if ((input === 'i' || input === 'I') && !isPowerlineEnabled) {
                const newInheritColors = !inheritColors;
                setInheritColors(newInheritColors);
                const updatedSettings = {
                    ...settings,
                    inheritSeparatorColors: newInheritColors
                };
                onUpdate(updatedSettings);
            } else if ((input === 'b' || input === 'B') && !isPowerlineEnabled) {
                // Cycle through background colors
                const nextIndex = (currentBgIndex + 1) % bgColors.length;
                const nextBgColor = bgColors[nextIndex];
                const updatedSettings = {
                    ...settings,
                    overrideBackgroundColor: nextBgColor === 'none' ? undefined : nextBgColor
                };
                onUpdate(updatedSettings);
            } else if ((input === 'c' || input === 'C') && !isPowerlineEnabled) {
                // Clear override background color
                const updatedSettings = {
                    ...settings,
                    overrideBackgroundColor: undefined
                };
                onUpdate(updatedSettings);
            } else if (input === 'o' || input === 'O') {
                // Toggle global bold
                const newGlobalBold = !globalBold;
                setGlobalBold(newGlobalBold);
                const updatedSettings = {
                    ...settings,
                    globalBold: newGlobalBold
                };
                onUpdate(updatedSettings);
            } else if (input === 'f' || input === 'F') {
                // Cycle through foreground colors
                const nextIndex = (currentFgIndex + 1) % fgColors.length;
                const nextFgColor = fgColors[nextIndex];
                const updatedSettings = {
                    ...settings,
                    overrideForegroundColor: nextFgColor === 'none' ? undefined : nextFgColor
                };
                onUpdate(updatedSettings);
            } else if (input === 'g' || input === 'G') {
                // Clear override foreground color
                const updatedSettings = {
                    ...settings,
                    overrideForegroundColor: undefined
                };
                onUpdate(updatedSettings);
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Global Overrides</Text>
            <Text dimColor>Configure automatic padding and separators between items</Text>
            {isPowerlineEnabled && (
                <Box marginTop={1}>
                    <Text color="yellow">⚠ Some options are disabled while Powerline mode is active</Text>
                </Box>
            )}
            <Box marginTop={1} />

            {editingPadding ? (
                <Box flexDirection="column">
                    <Box>
                        <Text>Enter default padding (applied to left and right of each item): </Text>
                        <Text color="cyan">{paddingInput ? `"${paddingInput}"` : '(empty)'}</Text>
                    </Box>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : editingSeparator ? (
                <Box flexDirection="column">
                    <Box>
                        <Text>Enter default separator (placed between items): </Text>
                        <Text color="cyan">{separatorInput ? `"${separatorInput}"` : '(empty - no separator will be added)'}</Text>
                    </Box>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : (
                <>
                    <Box>
                        <Text>      Global Bold: </Text>
                        <Text color={globalBold ? "green" : "red"}>{globalBold ? '✓ Enabled' : '✗ Disabled'}</Text>
                        <Text dimColor> - Press (o) to toggle</Text>
                    </Box>

                    <Box>
                        <Text>  Default Padding: </Text>
                        <Text color="cyan">{settings.defaultPadding ? `"${settings.defaultPadding}"` : '(none)'}</Text>
                        <Text dimColor> - Press (p) to edit</Text>
                    </Box>

                    <Box>
                        <Text>Override FG Color: </Text>
                        {(() => {
                            const fgColor = settings.overrideForegroundColor || 'none';
                            if (fgColor === 'none') {
                                return <Text color="gray">(none)</Text>;
                            } else {
                                const fgFunc = (chalk as any)[fgColor];
                                const display = fgFunc ? fgFunc(fgColor) : fgColor;
                                return <Text>{display}</Text>;
                            }
                        })()}
                        <Text dimColor> - (f) cycle, (g) clear</Text>
                    </Box>

                    <Box>
                        <Text>Override BG Color: </Text>
                        {isPowerlineEnabled ? (
                            <Text dimColor>[disabled - Powerline active]</Text>
                        ) : (
                            <>
                                {(() => {
                                    const bgColor = settings.overrideBackgroundColor || 'none';
                                    if (bgColor === 'none') {
                                        return <Text color="gray">(none)</Text>;
                                    } else {
                                        const bgColorName = bgColor.replace(/^bg/, '').toLowerCase();
                                        const bgFunc = (chalk as any)[bgColor];
                                        const display = bgFunc ? bgFunc(` ${bgColorName} `) : bgColorName;
                                        return <Text>{display}</Text>;
                                    }
                                })()}
                                <Text dimColor> - (b) cycle, (c) clear</Text>
                            </>
                        )}
                    </Box>

                    <Box>
                        <Text>   Inherit Colors: </Text>
                        {isPowerlineEnabled ? (
                            <Text dimColor>[disabled - Powerline active]</Text>
                        ) : (
                            <>
                                <Text color={inheritColors ? "green" : "red"}>{inheritColors ? '✓ Enabled' : '✗ Disabled'}</Text>
                                <Text dimColor> - Press (i) to toggle</Text>
                            </>
                        )}
                    </Box>

                    <Box>
                        <Text>Default Separator: </Text>
                        {isPowerlineEnabled ? (
                            <Text dimColor>[disabled - Powerline active]</Text>
                        ) : (
                            <>
                                <Text color="cyan">{settings.defaultSeparator ? `"${settings.defaultSeparator}"` : '(none)'}</Text>
                                <Text dimColor> - Press (s) to edit</Text>
                            </>
                        )}
                    </Box>

                    <Box marginTop={2}>
                        <Text dimColor>Press ESC to go back</Text>
                    </Box>

                    <Box marginTop={1} flexDirection='column'>
                        <Text dimColor wrap='wrap'>
                            Note: These settings are applied during rendering and don't add items to your widget list.
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Inherit colors: Default separators will use colors from the preceding widget
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Global Bold: Makes all text bold regardless of individual settings
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Override colors: All items will use these colors instead of their configured colors
                        </Text>
                        <Box marginTop={1} flexDirection='column'>
                            <Text color='yellow'>⚠ VSCode Users: </Text>
                            <Text dimColor wrap='wrap'>If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.</Text>
                        </Box>
                    </Box>
                </>
            )}
        </Box>
    );
};

interface PowerlineConfigurationProps {
    settings: Settings;
    powerlineFontStatus: PowerlineFontStatus;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
    onInstallFonts: () => void;
    installingFonts: boolean;
    fontInstallMessage: string | null;
    onClearMessage: () => void;
}

const PowerlineConfiguration: React.FC<PowerlineConfigurationProps> = ({
    settings,
    powerlineFontStatus,
    onUpdate,
    onBack,
    onInstallFonts,
    installingFonts,
    fontInstallMessage,
    onClearMessage
}) => {
    const powerlineConfig = settings.powerline || {};
    const [editingMode, setEditingMode] = useState<'separator' | 'startCap' | 'endCap' | null>(null);
    const [customInput, setCustomInput] = useState('');
    const [cursorPos, setCursorPos] = useState(0);

    // Common powerline separators (thin ones don't work well, so excluded)
    const separators = [
        { char: '\uE0B0', name: 'Triangle Right', hex: 'E0B0' },
        { char: '\uE0B2', name: 'Triangle Left', hex: 'E0B2' },
        { char: '\uE0B4', name: 'Round Right', hex: 'E0B4' },
        { char: '\uE0B6', name: 'Round Left', hex: 'E0B6' },
    ];

    // Start caps (left-facing)
    const startCaps = [
        { char: '', name: 'None', hex: '' },
        { char: '\uE0B2', name: 'Triangle', hex: 'E0B2' },
        { char: '\uE0B6', name: 'Round', hex: 'E0B6' },
        { char: '\uE0BA', name: 'Lower Triangle', hex: 'E0BA' },
        { char: '\uE0BE', name: 'Diagonal', hex: 'E0BE' },
    ];

    // End caps (right-facing)
    const endCaps = [
        { char: '', name: 'None', hex: '' },
        { char: '\uE0B0', name: 'Triangle', hex: 'E0B0' },
        { char: '\uE0B4', name: 'Round', hex: 'E0B4' },
        { char: '\uE0B8', name: 'Lower Triangle', hex: 'E0B8' },
        { char: '\uE0BC', name: 'Diagonal', hex: 'E0BC' },
    ];

    const currentSeparatorIndex = separators.findIndex(s => s.char === (powerlineConfig.separator || '\uE0B0'));
    const currentStartCapIndex = startCaps.findIndex(c => c.char === (powerlineConfig.startCap || ''));
    const currentEndCapIndex = endCaps.findIndex(c => c.char === (powerlineConfig.endCap || ''));

    useInput((input, key) => {
        if (fontInstallMessage) {
            onClearMessage();
            return;
        }

        if (editingMode) {
            // Custom hex input mode
            if (key.escape) {
                setEditingMode(null);
                setCustomInput('');
                setCursorPos(0);
            } else if (key.return) {
                if (customInput.length === 4) {
                    const char = String.fromCharCode(parseInt(customInput, 16));
                    const newConfig = { ...powerlineConfig };

                    if (editingMode === 'separator') {
                        newConfig.separator = char;
                    } else if (editingMode === 'startCap') {
                        newConfig.startCap = char;
                    } else if (editingMode === 'endCap') {
                        newConfig.endCap = char;
                    }

                    onUpdate({ ...settings, powerline: newConfig });
                    setEditingMode(null);
                    setCustomInput('');
                    setCursorPos(0);
                }
            } else if (key.backspace && cursorPos > 0) {
                setCustomInput(customInput.slice(0, cursorPos - 1) + customInput.slice(cursorPos));
                setCursorPos(cursorPos - 1);
            } else if (input && /[0-9a-fA-F]/.test(input) && customInput.length < 4) {
                setCustomInput(customInput.slice(0, cursorPos) + input.toUpperCase() + customInput.slice(cursorPos));
                setCursorPos(cursorPos + 1);
            }
        } else {
            // Normal navigation mode
            if (key.escape) {
                onBack();
            } else if (input === 't' || input === 'T') {
                // Toggle powerline mode
                const newConfig = { ...powerlineConfig, enabled: !powerlineConfig.enabled };
                onUpdate({ ...settings, powerline: newConfig });
            } else if (input === 'i' || input === 'I') {
                // Install fonts
                if (!installingFonts) {
                    onInstallFonts();
                }
            } else if (powerlineConfig.enabled) {
                // These options only work when powerline is enabled
                if (input === 's' || input === 'S') {
                    // Cycle separator left
                    const newIndex = currentSeparatorIndex <= 0 ? separators.length - 1 : currentSeparatorIndex - 1;
                    const newConfig = { ...powerlineConfig, separator: separators[newIndex]?.char || '\uE0B0' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'd' || input === 'D') {
                    // Cycle separator right
                    const newIndex = (currentSeparatorIndex + 1) % separators.length;
                    const newConfig = { ...powerlineConfig, separator: separators[newIndex]?.char || '\uE0B0' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'e' || input === 'E') {
                    // Edit separator with custom hex
                    setEditingMode('separator');
                    setCustomInput('');
                    setCursorPos(0);
                } else if (input === 'a' || input === 'A') {
                    // Cycle start cap left
                    const newIndex = currentStartCapIndex <= 0 ? startCaps.length - 1 : currentStartCapIndex - 1;
                    const newConfig = { ...powerlineConfig, startCap: startCaps[newIndex]?.char || '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'w' || input === 'W') {
                    // Cycle start cap right
                    const newIndex = (currentStartCapIndex + 1) % startCaps.length;
                    const newConfig = { ...powerlineConfig, startCap: startCaps[newIndex]?.char || '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'q' || input === 'Q') {
                    // Edit start cap with custom hex
                    setEditingMode('startCap');
                    setCustomInput('');
                    setCursorPos(0);
                } else if (input === 'z' || input === 'Z') {
                    // Cycle end cap left
                    const newIndex = currentEndCapIndex <= 0 ? endCaps.length - 1 : currentEndCapIndex - 1;
                    const newConfig = { ...powerlineConfig, endCap: endCaps[newIndex]?.char || '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'x' || input === 'X') {
                    // Cycle end cap right
                    const newIndex = (currentEndCapIndex + 1) % endCaps.length;
                    const newConfig = { ...powerlineConfig, endCap: endCaps[newIndex]?.char || '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'c' || input === 'C') {
                    // Edit end cap with custom hex
                    setEditingMode('endCap');
                    setCustomInput('');
                    setCursorPos(0);
                }
            }
        }
    });

    const currentSeparator = separators[currentSeparatorIndex] || { char: powerlineConfig.separator || '\uE0B0', name: 'Custom', hex: 'Custom' };
    const currentStartCap = startCaps[currentStartCapIndex] || { char: powerlineConfig.startCap || '', name: 'Custom', hex: 'Custom' };
    const currentEndCap = endCaps[currentEndCapIndex] || { char: powerlineConfig.endCap || '', name: 'Custom', hex: 'Custom' };

    return (
        <Box flexDirection='column'>
            <Text bold>Powerline Configuration</Text>

            {installingFonts ? (
                <Box marginTop={2}>
                    <Text color='yellow'>Installing Powerline fonts... This may take a moment.</Text>
                </Box>
            ) : fontInstallMessage ? (
                <Box marginTop={2} flexDirection='column'>
                    <Text color={fontInstallMessage.includes('success') ? 'green' : 'red'}>
                        {fontInstallMessage}
                    </Text>
                    <Box marginTop={1}>
                        <Text dimColor>Press any key to continue...</Text>
                    </Box>
                </Box>
            ) : editingMode ? (
                <Box marginTop={2} flexDirection='column'>
                    <Text>Enter 4-digit hex code for {editingMode === 'separator' ? 'separator' : editingMode === 'startCap' ? 'start cap' : 'end cap'}:</Text>
                    <Text>
                        \u{customInput.slice(0, cursorPos)}
                        <Text backgroundColor='gray' color='black'>{customInput[cursorPos] || '_'}</Text>
                        {customInput.slice(cursorPos + 1)}
                        {customInput.length < 4 && customInput.length === cursorPos && <Text dimColor>{'_'.repeat(4 - customInput.length - 1)}</Text>}
                    </Text>
                    <Text dimColor>Enter 4 hex digits (0-9, A-F), then press Enter. ESC to cancel.</Text>
                </Box>
            ) : (
                <>
                    <Box flexDirection='column'>
                        <Text>
                            {'   Font Status: '}
                            {powerlineFontStatus.installed ? (
                                <Text color='green'>✓ Installed</Text>
                            ) : (
                                <>
                                    <Text color='yellow'>✗ Not Installed</Text>
                                    <Text dimColor> - Press (i) to install Powerline fonts</Text>
                                </>
                            )}
                        </Text>
                    </Box>

                    <Box>
                        <Text>Powerline Mode: </Text>
                        <Text color={powerlineConfig.enabled ? 'green' : 'red'}>
                            {powerlineConfig.enabled ? '✓ Enabled' : '✗ Disabled'}
                        </Text>
                        <Text dimColor> - Press (t) to toggle</Text>
                    </Box>

                    {powerlineConfig.enabled && (
                        <>
                            <Box flexDirection='column'>
                                <Text dimColor>When enabled, global overrides are disabled and powerline separators are used</Text>
                            </Box>

                            <Box marginTop={2}>
                                <Text>Separator: {currentSeparator.char ? `${currentSeparator.char} (${currentSeparator.name})` : '(none)'}</Text>
                                <Text dimColor> - (s/d) cycle, (e) custom hex</Text>
                            </Box>

                            <Box>
                                <Text>Start Cap: {currentStartCap.char ? `${currentStartCap.char} (${currentStartCap.name})` : '(none)'}</Text>
                                <Text dimColor> - (a/w) cycle, (q) custom hex</Text>
                            </Box>

                            <Box>
                                <Text>  End Cap: {currentEndCap.char ? `${currentEndCap.char} (${currentEndCap.name})` : '(none)'}</Text>
                                <Text dimColor> - (z/x) cycle, (c) custom hex</Text>
                            </Box>
                        </>
                    )}

                    <Box marginTop={2}>
                        <Text dimColor>Press ESC to go back</Text>
                    </Box>
                </>
            )}
        </Box>
    );
};

const App: React.FC = () => {
    const { exit } = useApp();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [screen, setScreen] = useState<'main' | 'lines' | 'items' | 'colors' | 'terminalWidth' | 'terminalConfig' | 'globalOverrides' | 'confirm' | 'powerline'>('main');
    const [selectedLine, setSelectedLine] = useState(0);
    const [menuSelections, setMenuSelections] = useState<Record<string, number>>({});
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; action: () => Promise<void> } | null>(null);
    const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
    const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);
    const [powerlineFontStatus, setPowerlineFontStatus] = useState<PowerlineFontStatus>({ installed: false });
    const [installingFonts, setInstallingFonts] = useState(false);
    const [fontInstallMessage, setFontInstallMessage] = useState<string | null>(null);

    useEffect(() => {
        loadSettings().then(loadedSettings => {
            // Set global chalk level based on settings (default to 256 colors for compatibility)
            chalk.level = loadedSettings.colorLevel ?? 2;
            // Ensure lines array exists and has 3 slots
            if (!loadedSettings.lines) {
                loadedSettings.lines = [[]];
            }
            while (loadedSettings.lines.length < 3) {
                loadedSettings.lines.push([]);
            }
            setSettings(loadedSettings);
            setOriginalSettings(JSON.parse(JSON.stringify(loadedSettings))); // Deep copy
        });
        isInstalled().then(setIsClaudeInstalled);

        // Check for Powerline fonts on startup (use sync version that doesn't call execSync)
        const fontStatus = checkPowerlineFonts();
        setPowerlineFontStatus(fontStatus);

        // Optionally do the async check later (but not blocking React)
        checkPowerlineFontsAsync().then(asyncStatus => {
            setPowerlineFontStatus(asyncStatus);
        });

        const handleResize = () => {
            setTerminalWidth(process.stdout.columns || 80);
        };

        process.stdout.on('resize', handleResize);
        return () => {
            process.stdout.off('resize', handleResize);
        };
    }, []);

    // Check for changes whenever settings update
    useEffect(() => {
        if (settings && originalSettings) {
            const hasAnyChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);
            setHasChanges(hasAnyChanges);
        }
    }, [settings, originalSettings]);

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            exit();
        }
    });

    if (!settings) {
        return <Text>Loading settings...</Text>;
    }

    const handleInstallUninstall = async () => {
        if (isClaudeInstalled) {
            // Uninstall
            setConfirmDialog({
                message: 'This will remove ccstatusline from ~/.claude/settings.json. Continue?',
                action: async () => {
                    await uninstallStatusLine();
                    setIsClaudeInstalled(false);
                    setScreen('main');
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        } else {
            // Always ask for consent before modifying Claude settings
            const existing = await getExistingStatusLine();
            let message: string;

            if (existing && existing !== 'npx -y ccstatusline@latest') {
                message = `This will modify ~/.claude/settings.json\n\nA status line is already configured: "${existing}"\nReplace it with npx -y ccstatusline@latest?`;
            } else if (existing === 'npx -y ccstatusline@latest') {
                message = 'ccstatusline is already installed in ~/.claude/settings.json\nUpdate it with the latest options?';
            } else {
                message = 'This will modify ~/.claude/settings.json to add ccstatusline.\nContinue?';
            }

            setConfirmDialog({
                message,
                action: async () => {
                    await installStatusLine();
                    setIsClaudeInstalled(true);
                    setScreen('main');
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        }
    };

    const handleMainMenuSelect = async (value: string) => {
        switch (value) {
            case 'lines':
                setScreen('lines');
                break;
            case 'colors':
                setScreen('colors');
                break;
            case 'terminalConfig':
                setScreen('terminalConfig');
                break;
            case 'globalOverrides':
                setScreen('globalOverrides');
                break;
            case 'powerline':
                setScreen('powerline');
                break;
            case 'install':
                await handleInstallUninstall();
                break;
            case 'save':
                await saveSettings(settings);
                setOriginalSettings(JSON.parse(JSON.stringify(settings))); // Update original after save
                setHasChanges(false);
                exit();
                break;
            case 'exit':
                exit();
                break;
        }
    };

    const updateLine = (lineIndex: number, items: StatusItem[]) => {
        const newLines = [...(settings.lines || [])];
        newLines[lineIndex] = items;
        setSettings({ ...settings, lines: newLines });
    };

    const handleLineSelect = (lineIndex: number) => {
        setSelectedLine(lineIndex);
        setScreen('items');
    };

    return (
        <Box flexDirection='column' padding={1}>
            <Box marginBottom={1}>
                <Text bold>
                    <Gradient name="retro">
                        CCStatusline Configuration
                    </Gradient>
                </Text>
                <Text bold> | {getPackageVersion() && `v${getPackageVersion()}`}</Text>
            </Box>

            <Box marginBottom={1}>
                <Text dimColor>Preview:</Text>
            </Box>
            <StatusLinePreview lines={settings.lines || [[]]} terminalWidth={terminalWidth} settings={settings} />

            <Box marginTop={2}>
                {screen === 'main' && (
                    <MainMenu
                        onSelect={(value) => {
                            // Only persist menu selection if not exiting
                            if (value !== 'save' && value !== 'exit') {
                                const menuMap: Record<string, number> = {
                                    'lines': 0,
                                    'colors': 1,
                                    'powerline': 2,
                                    'terminalWidth': 3,
                                    'globalOverrides': 4,
                                    'install': 5
                                };
                                setMenuSelections({ ...menuSelections, main: menuMap[value] || 0 });
                            }
                            handleMainMenuSelect(value);
                        }}
                        isClaudeInstalled={isClaudeInstalled}
                        hasChanges={hasChanges}
                        initialSelection={menuSelections.main || 0}
                        powerlineFontStatus={powerlineFontStatus}
                        settings={settings}
                    />
                )}
                {screen === 'lines' && (
                    <LineSelector
                        lines={settings.lines || [[]]}
                        onSelect={(line) => {
                            setMenuSelections({ ...menuSelections, lines: line });
                            handleLineSelect(line);
                        }}
                        onBack={() => {
                            // Save that we came from 'lines' menu (index 0)
                            // Clear the line selection so it resets next time we enter
                            const { lines: _, ...restMenuSelections } = menuSelections;
                            setMenuSelections({ ...restMenuSelections, main: 0 });
                            setScreen('main');
                        }}
                        initialSelection={menuSelections.lines || 0}
                    />
                )}
                {screen === 'items' && settings.lines && (
                    <ItemsEditor
                        items={settings.lines[selectedLine] || []}
                        onUpdate={(items) => updateLine(selectedLine, items)}
                        onBack={() => {
                            // When going back to lines menu, preserve which line was selected
                            setMenuSelections({ ...menuSelections, lines: selectedLine });
                            setScreen('lines');
                        }}
                        lineNumber={selectedLine + 1}
                    />
                )}
                {screen === 'colors' && (
                    <ColorMenu
                        items={settings.lines?.flat().map(item => ({...item})) || []}
                        settings={settings}
                        onUpdate={(items) => {
                            // This is a bit tricky - we need to update colors across all lines
                            // For now, just update the flat list
                            // IMPORTANT: Create a deep copy to avoid mutating the original
                            const newLines = settings.lines?.map(line => [...line]) || [[]];
                            let flatIndex = 0;
                            for (let lineIndex = 0; lineIndex < newLines.length; lineIndex++) {
                                const line = newLines[lineIndex];
                                if (line) {
                                    for (let itemIndex = 0; itemIndex < line.length; itemIndex++) {
                                        if (flatIndex < items.length && items[flatIndex]) {
                                            // Create a new object to avoid mutation
                                            line[itemIndex] = { ...items[flatIndex]! };
                                            flatIndex++;
                                        }
                                    }
                                }
                            }
                            setSettings({ ...settings, lines: newLines });
                        }}
                        onBack={() => {
                            // Save that we came from 'colors' menu (index 1)
                            setMenuSelections({ ...menuSelections, main: 1 });
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'terminalConfig' && (
                    <TerminalConfigMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={(target?: string) => {
                            if (target === 'width') {
                                setScreen('terminalWidth');
                            } else {
                                // Save that we came from 'terminalConfig' menu (index 4 - accounting for gaps)
                                setMenuSelections({ ...menuSelections, main: 4 });
                                setScreen('main');
                            }
                        }}
                    />
                )}
                {screen === 'terminalWidth' && (
                    <TerminalWidthOptions
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            setScreen('terminalConfig');
                        }}
                    />
                )}
                {screen === 'globalOverrides' && (
                    <GlobalOverridesMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            // Save that we came from 'globalOverrides' menu (index 3 - accounting for gaps)
                            setMenuSelections({ ...menuSelections, main: 3 });
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'confirm' && confirmDialog && (
                    <ConfirmDialog
                        message={confirmDialog.message}
                        onConfirm={confirmDialog.action}
                        onCancel={() => {
                            setScreen('main');
                            setConfirmDialog(null);
                        }}
                    />
                )}
                {screen === 'powerline' && (
                    <PowerlineConfiguration
                        settings={settings}
                        powerlineFontStatus={powerlineFontStatus}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            setScreen('main');
                        }}
                        onInstallFonts={() => {
                            setInstallingFonts(true);
                            installPowerlineFonts().then(result => {
                                setInstallingFonts(false);
                                setFontInstallMessage(result.message);
                                // Refresh font status
                                checkPowerlineFontsAsync().then(asyncStatus => {
                                    setPowerlineFontStatus(asyncStatus);
                                });
                            });
                        }}
                        installingFonts={installingFonts}
                        fontInstallMessage={fontInstallMessage}
                        onClearMessage={() => setFontInstallMessage(null)}
                    />
                )}
            </Box>
        </Box>
    );
};

export function runTUI() {
    // Clear the terminal before starting the TUI
    process.stdout.write('\x1b[2J\x1b[H');
    render(<App />);
}