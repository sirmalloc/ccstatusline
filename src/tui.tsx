import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { loadSettings, saveSettings, type Settings, type StatusItem, type StatusItemType, type FlexMode } from './config';
import { isInstalled, installStatusLine, uninstallStatusLine, getExistingStatusLine } from './claude-settings';
import * as fs from 'fs';
import * as path from 'path';

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

// Helper function to apply foreground, background colors and bold
const applyColors = (text: string, foregroundColor?: string, backgroundColor?: string, bold?: boolean): string => {
    let result = text;
    
    // Ignore 'dim' color - it causes issues with terminal rendering
    if (foregroundColor && foregroundColor !== 'dim') {
        const fgFunc = (chalk as any)[foregroundColor];
        if (fgFunc) {
            result = fgFunc(result);
        }
    }
    
    if (backgroundColor && backgroundColor !== 'none') {
        const bgFunc = (chalk as any)[backgroundColor];
        if (bgFunc) {
            result = bgFunc(result);
        }
    }
    
    if (bold) {
        result = chalk.bold(result);
    }
    
    return result;
};

const renderSingleLine = (items: StatusItem[], terminalWidth: number, widthDetectionAvailable: boolean, settings?: Settings): string => {
    // Helper to apply colors with optional background and foreground override
    const applyItemColors = (text: string, item: StatusItem, defaultColor?: string): string => {
        // Override foreground color takes precedence over EVERYTHING
        let fgColor = item.color || defaultColor;
        if (settings?.overrideForegroundColor && settings.overrideForegroundColor !== 'none') {
            fgColor = settings.overrideForegroundColor;
        }
        
        // Override background color takes precedence over EVERYTHING
        let bgColor = item.backgroundColor;
        if (settings?.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none') {
            bgColor = settings.overrideBackgroundColor;
        }
        
        const shouldBold = settings?.globalBold || item.bold;
        return applyColors(text, fgColor, bgColor, shouldBold);
    };
    // Calculate effective width based on flex mode settings
    let effectiveWidth: number | null = null;
    if (widthDetectionAvailable && terminalWidth) {
        const flexMode = settings?.flexMode || 'full-minus-40';

        if (flexMode === 'full') {
            effectiveWidth = terminalWidth - 2; // Subtract 2 for terminal padding in preview
        } else if (flexMode === 'full-minus-40') {
            effectiveWidth = terminalWidth - 40;
        } else if (flexMode === 'full-until-compact') {
            // For preview, always show full width
            effectiveWidth = terminalWidth - 2; // Subtract 2 for terminal padding in preview
        }
    }
    // Always ensure we have a width for truncation
    const width = terminalWidth; // Always use terminal width for truncation
    const flexWidth = effectiveWidth; // Use this for flex separator calculations
    const rawElements: { content: string; type: string; item?: StatusItem }[] = [];
    let hasFlexSeparator = false;

    items.forEach((item, index) => {
        switch (item.type) {
            case 'model':
                const modelText = item.rawValue ? 'Claude' : 'Model: Claude';
                rawElements.push({ content: applyItemColors(modelText, item, 'cyan'), type: 'model', item });
                break;
            case 'git-branch':
                const branchText = '⎇ main';
                rawElements.push({ content: applyItemColors(branchText, item, 'magenta'), type: 'git-branch', item });
                break;
            case 'git-changes':
                const changesText = '(+42,-10)';
                rawElements.push({ content: applyItemColors(changesText, item, 'yellow'), type: 'git-changes', item });
                break;
            case 'tokens-input':
                const inputText = item.rawValue ? '15.2k' : 'In: 15.2k';
                rawElements.push({ content: applyItemColors(inputText, item, 'blue'), type: 'tokens-input', item });
                break;
            case 'tokens-output':
                const outputText = item.rawValue ? '3.4k' : 'Out: 3.4k';
                rawElements.push({ content: applyItemColors(outputText, item, 'white'), type: 'tokens-output', item });
                break;
            case 'tokens-cached':
                const cachedText = item.rawValue ? '12k' : 'Cached: 12k';
                rawElements.push({ content: applyItemColors(cachedText, item, 'cyan'), type: 'tokens-cached', item });
                break;
            case 'tokens-total':
                const totalText = item.rawValue ? '30.6k' : 'Total: 30.6k';
                rawElements.push({ content: applyItemColors(totalText, item, 'cyan'), type: 'tokens-total', item });
                break;
            case 'context-length':
                const ctxText = item.rawValue ? '18.6k' : 'Ctx: 18.6k';
                rawElements.push({ content: applyItemColors(ctxText, item, 'gray'), type: 'context-length', item });
                break;
            case 'context-percentage':
                const ctxPctText = item.rawValue ? '9.3%' : 'Ctx: 9.3%';
                rawElements.push({ content: applyItemColors(ctxPctText, item, 'blue'), type: 'context-percentage', item });
                break;
            case 'context-percentage-usable':
                const ctxUsableText = item.rawValue ? '11.6%' : 'Ctx(u): 11.6%';
                rawElements.push({ content: applyItemColors(ctxUsableText, item, 'green'), type: 'context-percentage-usable', item });
                break;
            case 'session-clock':
                const sessionText = item.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
                rawElements.push({ content: applyItemColors(sessionText, item, 'yellow'), type: 'session-clock', item });
                break;
            case 'version':
                const versionText = item.rawValue ? '1.0.72' : 'Version: 1.0.72';
                rawElements.push({ content: applyItemColors(versionText, item, 'green'), type: 'version', item });
                break;
            case 'terminal-width':
                const detectedWidth = canDetectTerminalWidth() ? terminalWidth : '??';
                const termText = item.rawValue ? `${detectedWidth}` : `Term: ${detectedWidth}`;
                rawElements.push({ content: applyItemColors(termText, item, 'gray'), type: 'terminal-width', item });
                break;
            case 'separator':
                const sepChar = item.character || '|';
                // Handle special separator cases
                let sepContent;
                if (sepChar === ',') {
                    sepContent = `${sepChar} `;
                } else if (sepChar === ' ') {
                    sepContent = ' ';
                } else {
                    sepContent = ` ${sepChar} `;
                }
                rawElements.push({ content: applyItemColors(sepContent, item, 'gray'), type: 'separator', item });
                break;
            case 'flex-separator':
                rawElements.push({ content: 'FLEX', type: 'flex-separator', item });
                hasFlexSeparator = true;
                break;
            case 'custom-text':
                const customText = item.customText || '';
                rawElements.push({ content: applyItemColors(customText, item, 'white'), type: 'custom-text', item });
                break;
            case 'custom-command':
                const cmdText = item.commandPath ? `[cmd: ${item.commandPath.substring(0, 20)}${item.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
                // Only apply color if not preserving colors
                if (!item.preserveColors) {
                    rawElements.push({ content: applyItemColors(cmdText, item, 'white'), type: 'custom-command', item });
                } else {
                    // When preserving colors, just show the text without applying our colors
                    rawElements.push({ content: cmdText, type: 'custom-command', item });
                }
                break;
        }
    });

    // Apply default padding and separators
    const elements: string[] = [];
    const padding = settings?.defaultPadding || '';
    const defaultSep = settings?.defaultSeparator || '';
    
    // Debug: Check if we have a default separator
    // console.log('Default separator:', JSON.stringify(defaultSep), 'Length:', defaultSep.length);
    
    rawElements.forEach((elem, index) => {
        // Add default separator between any two items (but not before first item)
        if (defaultSep && index > 0) {
            // Check if we should inherit colors from the previous element
            if (settings?.inheritSeparatorColors && index > 0) {
                const prevElem = rawElements[index - 1];
                if (prevElem && prevElem.item) {
                    // Apply the previous element's colors to the separator (with overrides)
                    const fgColor = settings?.overrideForegroundColor && settings.overrideForegroundColor !== 'none'
                        ? settings.overrideForegroundColor
                        : prevElem.item.color;
                    const bgColor = settings?.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none'
                        ? settings.overrideBackgroundColor
                        : prevElem.item.backgroundColor;
                    const shouldBold = settings?.globalBold || prevElem.item.bold;
                    const coloredSep = applyColors(defaultSep, fgColor, bgColor, shouldBold);
                    elements.push(coloredSep);
                } else {
                    elements.push(defaultSep);
                }
            } else if (settings?.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none' || 
                       settings?.overrideForegroundColor && settings.overrideForegroundColor !== 'none') {
                // Apply override colors even when not inheriting colors
                const fgColor = settings?.overrideForegroundColor && settings.overrideForegroundColor !== 'none'
                    ? settings.overrideForegroundColor
                    : undefined;
                const coloredSep = applyColors(defaultSep, fgColor, settings.overrideBackgroundColor, settings?.globalBold);
                elements.push(coloredSep);
            } else {
                elements.push(defaultSep);
            }
        }
        
        // Add the element itself
        if (elem.type === 'separator' || elem.type === 'flex-separator') {
            elements.push(elem.content);
        } else {
            // Apply padding with the same colors as the item (or overrides)
            const fgColor = settings?.overrideForegroundColor && settings.overrideForegroundColor !== 'none'
                ? settings.overrideForegroundColor
                : undefined;
            const bgColor = settings?.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none'
                ? settings.overrideBackgroundColor
                : elem.item?.backgroundColor;
            
            if (padding && (bgColor || fgColor)) {
                // Apply colors to padding
                const paddedContent = applyColors(padding, fgColor, bgColor, settings?.globalBold) + 
                                     elem.content + 
                                     applyColors(padding, fgColor, bgColor, settings?.globalBold);
                elements.push(paddedContent);
            } else {
                // No colors or no padding
                elements.push(padding + elem.content + padding);
            }
        }
    });

    // Build the status line with flex separator support
    let statusLine = '';
    if (hasFlexSeparator && flexWidth) {
        const parts: string[][] = [[]];
        let currentPart = 0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item && item.type === 'flex-separator') {
                currentPart++;
                parts[currentPart] = [];
            } else {
                const element = elements[i];
                if (element !== 'FLEX' && parts[currentPart]) {
                    parts[currentPart]!.push(element as string);
                }
            }
        }

        // Calculate total length of all non-flex content
        const partLengths = parts.map(part => {
            const joined = part.join('');
            return joined.replace(/\x1b\[[0-9;]*m/g, '').length;
        });
        const totalContentLength = partLengths.reduce((sum, len) => sum + len, 0);

        // Calculate space to distribute among flex separators
        const flexCount = parts.length - 1; // Number of flex separators
        const totalSpace = Math.max(0, flexWidth - totalContentLength);
        const spacePerFlex = flexCount > 0 ? Math.floor(totalSpace / flexCount) : 0;
        const extraSpace = flexCount > 0 ? totalSpace % flexCount : 0;

        // Build the status line with distributed spacing
        statusLine = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part) {
                statusLine += part.join('');
            }
            if (i < parts.length - 1) {
                // Add flex spacing
                const spaces = spacePerFlex + (i < extraSpace ? 1 : 0);
                statusLine += ' '.repeat(spaces);
            }
        }
    } else {
        // No width detection available - treat flex separators as normal separators
        statusLine = elements.map(e => e === 'FLEX' ? chalk.gray(' | ') : e).join('');
    }

    // Truncate if the line exceeds the maximum width
    if (width && width > 0) {
        // Remove ANSI escape codes to get actual length
        const plainLength = statusLine.replace(/\x1b\[[0-9;]*m/g, '').length;

        if (plainLength > width) {
            // Need to truncate - preserve ANSI codes while truncating
            let truncated = '';
            let currentLength = 0;
            let inAnsiCode = false;
            let ansiBuffer = '';
            const targetLength = width - 5; // Reserve 3 chars for ellipsis + 2 for proper fit in preview

            for (let i = 0; i < statusLine.length; i++) {
                const char = statusLine[i];

                if (char === '\x1b') {
                    inAnsiCode = true;
                    ansiBuffer = char;
                } else if (inAnsiCode) {
                    ansiBuffer += char;
                    if (char === 'm') {
                        truncated += ansiBuffer;
                        inAnsiCode = false;
                        ansiBuffer = '';
                    }
                } else {
                    if (currentLength < targetLength) {
                        truncated += char;
                        currentLength++;
                    } else {
                        break;
                    }
                }
            }

            statusLine = truncated + '...';
        }
    }

    return statusLine;
};

const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings }) => {
    const widthDetectionAvailable = canDetectTerminalWidth();
    // Build the Claude Code input box - account for ink's padding
    const boxWidth = Math.min(terminalWidth - 4, process.stdout.columns - 4 || 76);
    const topLine = chalk.gray('╭' + '─'.repeat(Math.max(0, boxWidth - 2)) + '╮');
    const middleLine = chalk.gray('│') + ' > ' + ' '.repeat(Math.max(0, boxWidth - 5)) + chalk.gray('│');
    const bottomLine = chalk.gray('╰' + '─'.repeat(Math.max(0, boxWidth - 2)) + '╯');

    // Render each configured line - account for 2-space prefix in display
    const availableWidth = boxWidth - 2; // Account for 2-space indent
    const renderedLines = lines.map(lineItems =>
        lineItems.length > 0 ? renderSingleLine(lineItems, availableWidth, widthDetectionAvailable, settings) : ''
    ).filter(line => line !== ''); // Remove empty lines

    return (
        <Box flexDirection='column'>
            <Text>{topLine}</Text>
            <Text>{middleLine}</Text>
            <Text>{bottomLine}</Text>
            {renderedLines.map((line, index) => (
                <Text key={index}>  {line}</Text>
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
}

const MainMenu: React.FC<MainMenuProps> = ({ onSelect, isClaudeInstalled, hasChanges, initialSelection = 0 }) => {
    const items = [
        { label: '📝 Edit Lines', value: 'lines' },
        { label: '🎨 Configure Colors', value: 'colors' },
        { label: '⚡ Flex Options', value: 'flex' },
        { label: '🔧 Global Options', value: 'globalOptions' },
        { label: isClaudeInstalled ? '🗑️  Uninstall from Claude Code' : '📦 Install to Claude Code', value: 'install' },
    ];

    if (hasChanges) {
        items.push(
            { label: '💾 Save & Exit', value: 'save' },
            { label: '❌ Exit without saving', value: 'exit' }
        );
    } else {
        items.push({ label: '🚪 Exit', value: 'exit' });
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Main Menu</Text>
            <Box marginTop={1}>
                <SelectInput 
                    items={items} 
                    onSelect={(item) => onSelect(item.value)} 
                    initialIndex={Math.min(initialSelection, items.length - 1)}
                />
            </Box>
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
            } else if (key.backspace || key.delete) {
                if (textCursorPos > 0) {
                    setTextInput(textInput.slice(0, textCursorPos - 1) + textInput.slice(textCursorPos));
                    setTextCursorPos(textCursorPos - 1);
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
            } else if (key.backspace || key.delete) {
                if (commandCursorPos > 0) {
                    setCommandInput(commandInput.slice(0, commandCursorPos - 1) + commandInput.slice(commandCursorPos));
                    setCommandCursorPos(commandCursorPos - 1);
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
            } else if (key.backspace || key.delete) {
                setMaxWidthInput(maxWidthInput.slice(0, -1));
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
            } else if (key.backspace || key.delete) {
                setTimeoutInput(timeoutInput.slice(0, -1));
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

    // Helper to get the default color for each item type
    const getDefaultColor = (type: string): string => {
        switch (type) {
            case 'model': return 'cyan';
            case 'git-branch': return 'magenta';
            case 'git-changes': return 'yellow';
            case 'session-clock': return 'yellow';
            case 'version': return 'green';
            case 'tokens-input': return 'blue';
            case 'tokens-output': return 'white';
            case 'tokens-cached': return 'cyan';
            case 'tokens-total': return 'cyan';
            case 'context-length': return 'dim';
            case 'context-percentage': return 'blue';
            case 'context-percentage-usable': return 'green';
            case 'terminal-width': return 'gray';
            case 'custom-text': return 'white';
            case 'custom-command': return 'white';
            default: return 'white';
        }
    };

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
    onUpdate: (items: StatusItem[]) => void;
    onBack: () => void;
}

const ColorMenu: React.FC<ColorMenuProps> = ({ items, onUpdate, onBack }) => {
    const colorableItems = items.filter(item =>
        ['model', 'git-branch', 'git-changes', 'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable', 'session-clock', 'terminal-width', 'version', 'custom-text', 'custom-command'].includes(item.type) &&
        !(item.type === 'custom-command' && item.preserveColors) // Exclude custom-command items with preserveColors
    );
    const [highlightedItemId, setHighlightedItemId] = useState<string | null>(colorableItems[0]?.id || null);
    const [editingBackground, setEditingBackground] = useState(false);

    // Get default color for each item type (matching ccstatusline.ts defaults)
    const getDefaultColor = (type: string): string => {
        switch (type) {
            case 'model': return 'cyan';
            case 'git-branch': return 'magenta';
            case 'git-changes': return 'yellow';
            case 'session-clock': return 'yellow';
            case 'version': return 'green';
            case 'tokens-input': return 'blue';
            case 'tokens-output': return 'white';
            case 'tokens-cached': return 'cyan';
            case 'tokens-total': return 'cyan';
            case 'context-length': return 'gray';
            case 'context-percentage': return 'blue';
            case 'context-percentage-usable': return 'green';
            case 'terminal-width': return 'gray';
            case 'custom-text': return 'white';
            case 'custom-command': return 'white';
            case 'separator': return 'gray';
            default: return 'white';
        }
    };

    // Handle keyboard input
    const hasNoItems = colorableItems.length === 0;
    useInput((input, key) => {
        // If no items, any key goes back
        if (hasNoItems) {
            onBack();
            return;
        }
        
        // Normal keyboard handling when there are items
        if (key.escape) {
            if (editingBackground) {
                setEditingBackground(false);
            } else {
                onBack();
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
                        const currentBgColor = item.backgroundColor || 'none';
                        let currentBgColorIndex = bgColors.indexOf(currentBgColor);
                        // If color not found, start from beginning
                        if (currentBgColorIndex === -1) currentBgColorIndex = 0;
                        const nextBgColor = bgColors[(currentBgColorIndex + 1) % bgColors.length];
                        return { ...item, backgroundColor: nextBgColor === 'none' ? undefined : nextBgColor };
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
    const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'gray', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
        'magentaBright', 'cyanBright', 'whiteBright'];
    
    // Background colors list (includes 'none' as first option)
    // Note: chalk doesn't support bgDim, so we exclude it from background colors
    const bgColors = ['none', 'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 
        'bgCyan', 'bgWhite', 'bgGray', 'bgRedBright', 'bgGreenBright', 'bgYellowBright', 
        'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright'];

    // Get current color for highlighted item
    const selectedItem = highlightedItemId && highlightedItemId !== 'back' 
        ? colorableItems.find(item => item.id === highlightedItemId) 
        : null;
    const currentColor = editingBackground 
        ? (selectedItem?.backgroundColor || 'none')
        : (selectedItem ? (selectedItem.color || getDefaultColor(selectedItem.type)) : 'white');
    
    const colorList = editingBackground ? bgColors : colors;
    const colorIndex = colorList.indexOf(currentColor);
    const colorNumber = colorIndex === -1 ? (editingBackground ? 1 : 8) : colorIndex + 1;
    
    let colorDisplay;
    if (editingBackground) {
        if (currentColor === 'none') {
            colorDisplay = chalk.gray('(no background)');
        } else {
            const bgColorName = currentColor.replace(/^bg/, '').toLowerCase();
            const bgFunc = (chalk as any)[currentColor];
            colorDisplay = bgFunc ? bgFunc(` ${bgColorName} `) : chalk.white(currentColor);
        }
    } else {
        colorDisplay = (chalk as any)[currentColor] ? (chalk as any)[currentColor](currentColor) : chalk.white(currentColor);
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Configure Colors {editingBackground && chalk.yellow('[Background Mode]')}</Text>
            <Text dimColor>↑↓ to select, Enter to cycle {editingBackground ? 'background' : 'foreground'}, (f) to toggle bg/fg, (b)old, (r)eset, ESC to go back</Text>
            {selectedItem && (
                <Box marginTop={1}>
                    <Text>
                        Current {editingBackground ? 'background' : 'foreground'} ({colorNumber}/{colorList.length}): {colorDisplay}
                        {selectedItem.bold && chalk.bold(' [BOLD]')}
                    </Text>
                </Box>
            )}
            <Box marginTop={1}>
                <SelectInput
                    items={menuItems}
                    onSelect={handleSelect}
                    onHighlight={handleHighlight}
                    initialIndex={0}
                />
            </Box>
            <Box marginTop={1}>
                <Text color='yellow'>⚠ VSCode users: </Text>
                <Text dimColor>If colors appear incorrect, your VSCode theme may be overriding them.</Text>
            </Box>
        </Box>
    );
};

interface FlexOptionsProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

const FlexOptions: React.FC<FlexOptionsProps> = ({ settings, onUpdate, onBack }) => {
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
            } else if (key.backspace || key.delete) {
                setThresholdInput(thresholdInput.slice(0, -1));
                setValidationError(null);
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
            label: 'Full width minus 40',
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
            <Text bold>Flex Separator Width Options</Text>
            <Text dimColor>Select how flex separators calculate available width</Text>

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

interface GlobalOptionsMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

const GlobalOptionsMenu: React.FC<GlobalOptionsMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [editingPadding, setEditingPadding] = useState(false);
    const [editingSeparator, setEditingSeparator] = useState(false);
    const [paddingInput, setPaddingInput] = useState(settings.defaultPadding || '');
    const [separatorInput, setSeparatorInput] = useState(settings.defaultSeparator || '');
    const [inheritColors, setInheritColors] = useState(settings.inheritSeparatorColors || false);
    const [globalBold, setGlobalBold] = useState(settings.globalBold || false);
    
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
            } else if (key.backspace || key.delete) {
                setPaddingInput(paddingInput.slice(0, -1));
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
            } else if (key.backspace || key.delete) {
                setSeparatorInput(separatorInput.slice(0, -1));
            } else if (input) {
                setSeparatorInput(separatorInput + input);
            }
        } else {
            if (key.escape) {
                onBack();
            } else if (input === 'p' || input === 'P') {
                setEditingPadding(true);
            } else if (input === 's' || input === 'S') {
                setEditingSeparator(true);
            } else if (input === 'i' || input === 'I') {
                const newInheritColors = !inheritColors;
                setInheritColors(newInheritColors);
                const updatedSettings = {
                    ...settings,
                    inheritSeparatorColors: newInheritColors
                };
                onUpdate(updatedSettings);
            } else if (input === 'b' || input === 'B') {
                // Cycle through background colors
                const nextIndex = (currentBgIndex + 1) % bgColors.length;
                const nextBgColor = bgColors[nextIndex];
                const updatedSettings = {
                    ...settings,
                    overrideBackgroundColor: nextBgColor === 'none' ? undefined : nextBgColor
                };
                onUpdate(updatedSettings);
            } else if (input === 'c' || input === 'C') {
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
            <Text bold>Global Options</Text>
            <Text dimColor>Configure automatic padding and separators between items</Text>
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
                        <Text>  Default Padding: </Text>
                        <Text color="cyan">{settings.defaultPadding ? `"${settings.defaultPadding}"` : '(none)'}</Text>
                        <Text dimColor> - Press (p) to edit</Text>
                    </Box>
                    
                    <Box>
                        <Text>Default Separator: </Text>
                        <Text color="cyan">{settings.defaultSeparator ? `"${settings.defaultSeparator}"` : '(none)'}</Text>
                        <Text dimColor> - Press (s) to edit</Text>
                    </Box>
                    
                    <Box>
                        <Text>   Inherit Colors: </Text>
                        <Text color={inheritColors ? "green" : "red"}>{inheritColors ? '✓ Enabled' : '✗ Disabled'}</Text>
                        <Text dimColor> - Press (i) to toggle</Text>
                    </Box>
                    
                    <Box>
                        <Text>      Global Bold: </Text>
                        <Text color={globalBold ? "green" : "red"}>{globalBold ? '✓ Enabled' : '✗ Disabled'}</Text>
                        <Text dimColor> - Press (o) to toggle</Text>
                    </Box>
                    
                    <Box>
                        <Text>Override BG Color: </Text>
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
                        <Box marginTop={1}>
                            <Text color='yellow'>⚠ VSCode users: </Text>
                            <Text dimColor>If colors appear incorrect, your VSCode theme may be overriding them.</Text>
                        </Box>
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
    const [screen, setScreen] = useState<'main' | 'lines' | 'items' | 'colors' | 'flex' | 'globalOptions' | 'confirm'>('main');
    const [selectedLine, setSelectedLine] = useState(0);
    const [menuSelections, setMenuSelections] = useState<Record<string, number>>({});
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; action: () => Promise<void> } | null>(null);
    const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
    const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);

    useEffect(() => {
        loadSettings().then(loadedSettings => {
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
            case 'flex':
                setScreen('flex');
                break;
            case 'globalOptions':
                setScreen('globalOptions');
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
                <Text bold color='cyan'>CCStatusline Configuration {getPackageVersion() && `v${getPackageVersion()}`}</Text>
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
                                    'flex': 2,
                                    'globalOptions': 3,
                                    'install': 4
                                };
                                setMenuSelections({ ...menuSelections, main: menuMap[value] || 0 });
                            }
                            handleMainMenuSelect(value);
                        }}
                        isClaudeInstalled={isClaudeInstalled} 
                        hasChanges={hasChanges}
                        initialSelection={menuSelections.main || 0}
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
                        items={settings.lines?.flat() || []}
                        onUpdate={(items) => {
                            // This is a bit tricky - we need to update colors across all lines
                            // For now, just update the flat list
                            const newLines = settings.lines || [[]];
                            let flatIndex = 0;
                            for (let lineIndex = 0; lineIndex < newLines.length; lineIndex++) {
                                const line = newLines[lineIndex];
                                if (line) {
                                    for (let itemIndex = 0; itemIndex < line.length; itemIndex++) {
                                        if (flatIndex < items.length && items[flatIndex]) {
                                            line[itemIndex] = items[flatIndex]!;
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
                {screen === 'flex' && (
                    <FlexOptions
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            // Save that we came from 'flex' menu (index 2)
                            setMenuSelections({ ...menuSelections, main: 2 });
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'globalOptions' && (
                    <GlobalOptionsMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            // Save that we came from 'globalOptions' menu (index 3)
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
            </Box>
        </Box>
    );
};

export function runTUI() {
    // Clear the terminal before starting the TUI
    process.stdout.write('\x1b[2J\x1b[H');
    render(<App />);
}