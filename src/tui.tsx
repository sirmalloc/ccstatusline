import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { loadSettings, saveSettings, type Settings, type StatusItem, type StatusItemType } from './config';
import { isInstalled, installStatusLine, uninstallStatusLine, getExistingStatusLine } from './claude-settings';

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
}

const renderSingleLine = (items: StatusItem[], terminalWidth: number, widthDetectionAvailable: boolean): string => {
    // Use full terminal width for calculations, we'll handle truncation at the end if needed
    const width = widthDetectionAvailable ? terminalWidth : null;
    const elements: string[] = [];
    let hasFlexSeparator = false;

    items.forEach(item => {
        switch (item.type) {
            case 'model':
                const modelColor = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
                elements.push(modelColor('Model: Claude'));
                break;
            case 'git-branch':
                const branchColor = (chalk as any)[item.color || 'magenta'] || chalk.magenta;
                elements.push(branchColor('⎇ main'));
                break;
            case 'git-changes':
                const changesColor = (chalk as any)[item.color || 'yellow'] || chalk.yellow;
                elements.push(changesColor('(+42,-10)'));
                break;
            case 'tokens-input':
                const inputColor = (chalk as any)[item.color || 'yellow'] || chalk.yellow;
                elements.push(inputColor('In: 15.2k'));
                break;
            case 'tokens-output':
                const outputColor = (chalk as any)[item.color || 'green'] || chalk.green;
                elements.push(outputColor('Out: 3.4k'));
                break;
            case 'tokens-cached':
                const cachedColor = (chalk as any)[item.color || 'blue'] || chalk.blue;
                elements.push(cachedColor('Cached: 12k'));
                break;
            case 'tokens-total':
                const totalColor = (chalk as any)[item.color || 'white'] || chalk.white;
                elements.push(totalColor('Total: 30.6k'));
                break;
            case 'context-length':
                const ctxColor = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
                elements.push(ctxColor('Ctx: 18.6k'));
                break;
            case 'context-percentage':
                const ctxPctColor = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
                elements.push(ctxPctColor('Ctx: 9.3%'));
                break;
            case 'session-clock':
                const sessionColor = (chalk as any)[item.color || 'blue'] || chalk.blue;
                elements.push(sessionColor('Session: 2hr 15m'));
                break;
            case 'version':
                const versionColor = (chalk as any)[item.color || 'green'] || chalk.green;
                elements.push(versionColor('Version: 1.0.72'));
                break;
            case 'terminal-width':
                const termColor = (chalk as any)[item.color || 'dim'] || chalk.dim;
                const detectedWidth = canDetectTerminalWidth() ? terminalWidth : '??';
                elements.push(termColor(`Term: ${detectedWidth}`));
                break;
            case 'separator':
                const sepChar = item.character || '|';
                // Handle special separator cases
                let sepContent;
                if (sepChar === ',') {
                    sepContent = chalk.dim(`${sepChar} `);
                } else if (sepChar === ' ') {
                    sepContent = chalk.dim(' ');
                } else {
                    sepContent = chalk.dim(` ${sepChar} `);
                }
                elements.push(sepContent);
                break;
            case 'flex-separator':
                elements.push('FLEX');
                hasFlexSeparator = true;
                break;
        }
    });

    // Build the status line with flex separator support
    let statusLine = '';
    if (hasFlexSeparator && width) {
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
        const totalSpace = Math.max(0, width - totalContentLength);
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
        statusLine = elements.map(e => e === 'FLEX' ? chalk.dim(' | ') : e).join('');
    }

    return statusLine;
};

const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth }) => {
    const widthDetectionAvailable = canDetectTerminalWidth();
    // Build the Claude Code input box - account for ink's padding
    const boxWidth = Math.min(terminalWidth - 4, process.stdout.columns - 4 || 76);
    const topLine = chalk.dim('╭' + '─'.repeat(Math.max(0, boxWidth - 2)) + '╮');
    const middleLine = chalk.dim('│') + ' > ' + ' '.repeat(Math.max(0, boxWidth - 5)) + chalk.dim('│');
    const bottomLine = chalk.dim('╰' + '─'.repeat(Math.max(0, boxWidth - 2)) + '╯');

    // Render each configured line - use boxWidth for consistency
    const renderedLines = lines.map(lineItems => 
        lineItems.length > 0 ? renderSingleLine(lineItems, boxWidth, widthDetectionAvailable) : ''
    ).filter(line => line !== ''); // Remove empty lines

    return (
        <Box flexDirection='column'>
            <Text>{topLine}</Text>
            <Text>{middleLine}</Text>
            <Text>{bottomLine}</Text>
            {renderedLines.map((line, index) => (
                <Text key={index}>{line}</Text>
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

const LineSelector: React.FC<LineSelectorProps> = ({ lines, onSelect, onBack }) => {
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
                />
            </Box>
        </Box>
    );
};

interface MainMenuProps {
    onSelect: (value: string) => void;
    isClaudeInstalled: boolean;
    hasChanges: boolean;
}

const MainMenu: React.FC<MainMenuProps> = ({ onSelect, isClaudeInstalled, hasChanges }) => {
    const items = [
        { label: '📝 Edit Lines', value: 'lines' },
        { label: '🎨 Configure Colors', value: 'colors' },
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
                <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
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
    const separatorChars = ['|', '-', ',', ' '];

    useInput((input, key) => {
        if (moveMode) {
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
                    'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 
                    'session-clock', 'terminal-width', 'version', 'flex-separator'];
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
                    'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 
                    'session-clock', 'terminal-width', 'version', 'flex-separator'];
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
                // Add item at end
                const newItem: StatusItem = {
                    id: Date.now().toString(),
                    type: 'separator',
                };
                const newItems = [...items, newItem];
                onUpdate(newItems);
                setSelectedIndex(newItems.length - 1); // Move selection to new item
            } else if (input === 'i') {
                // Insert item after selected
                const newItem: StatusItem = {
                    id: Date.now().toString(),
                    type: 'separator',
                };
                const newItems = [...items];
                newItems.splice(selectedIndex + 1, 0, newItem);
                onUpdate(newItems);
                setSelectedIndex(selectedIndex + 1); // Selection already moves to new item
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
            } else if (key.escape) {
                onBack();
            }
        }
    });

    const getItemDisplay = (item: StatusItem) => {
        switch (item.type) {
            case 'model':
                return chalk.cyan('Model');
            case 'git-branch':
                return chalk.magenta('Git Branch');
            case 'git-changes':
                return chalk.yellow('Git Changes');
            case 'separator': {
                const char = item.character || '|';
                const charDisplay = char === ' ' ? '(space)' : char;
                return chalk.dim(`Separator ${charDisplay}`);
            }
            case 'flex-separator':
                return chalk.yellow('Flex Separator');
            case 'tokens-input':
                return chalk.yellow('Tokens Input');
            case 'tokens-output':
                return chalk.green('Tokens Output');
            case 'tokens-cached':
                return chalk.blue('Tokens Cached');
            case 'tokens-total':
                return chalk.white('Tokens Total');
            case 'context-length':
                return chalk.cyan('Context Length');
            case 'context-percentage':
                return chalk.cyan('Context %');
            case 'session-clock':
                return chalk.blue('Session Clock');
            case 'terminal-width':
                return chalk.dim('Terminal Width');
            case 'version':
                return chalk.green('Version');
        }
    };

    const hasFlexSeparator = items.some(item => item.type === 'flex-separator');
    const widthDetectionAvailable = canDetectTerminalWidth();
    
    return (
        <Box flexDirection='column'>
            <Text bold>Edit Line {lineNumber} {moveMode && <Text color='yellow'>[MOVE MODE]</Text>}</Text>
            {moveMode ? (
                <Text dimColor>↑↓ to move item, ESC or Enter to exit move mode</Text>
            ) : (
                <Text dimColor>↑↓ select, ←→ change type, Space edit separator, Enter to move, (a)dd, (i)nsert, (d)elete, (c)lear line, ESC back</Text>
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
                                {item.type === 'separator' && index === selectedIndex && !moveMode && (
                                    <Text dimColor> (Space to edit)</Text>
                                )}
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
        ['model', 'git-branch', 'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'session-clock', 'version'].includes(item.type)
    );
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Handle ESC key
    useInput((input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    if (colorableItems.length === 0) {
        return (
            <Box flexDirection='column'>
                <Text bold>Configure Colors</Text>
                <Box marginTop={1}><Text dimColor>No colorable items in the status line.</Text></Box>
                <Text dimColor>Add a Model or Git Branch item first.</Text>
                <Box marginTop={1}><Text>Press any key to go back...</Text></Box>
                {/* Press any key handler */}
                {(() => {
                    useInput(() => { onBack(); });
                    return null;
                })()}
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
            case 'session-clock': return 'Session Clock';
            case 'version': return 'Version';
            default: return item.type;
        }
    };

    // Create menu items with colored labels
    const menuItems = colorableItems.map((item, index) => {
        const color = item.color || 'white';
        const colorFunc = (chalk as any)[color] || chalk.white;
        return {
            label: colorFunc(`${getItemLabel(item)} #${index + 1}`),
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
                    const currentColorIndex = colors.indexOf(item.color || 'white');
                    const nextColor = colors[(currentColorIndex + 1) % colors.length];
                    return { ...item, color: nextColor };
                }
                return item;
            });
            onUpdate(newItems);
        }
    };

    const handleHighlight = (item: { value: string }) => {
        if (item.value !== 'back') {
            const itemIndex = colorableItems.findIndex(i => i.id === item.value);
            if (itemIndex !== -1) {
                setSelectedIndex(itemIndex);
            }
        }
    };

    // Color list for cycling
    const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'gray', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
        'magentaBright', 'cyanBright', 'whiteBright'];

    // Get current color for selected item (if a valid colorable item is selected)
    const selectedItem = selectedIndex < colorableItems.length ? colorableItems[selectedIndex] : null;
    const currentColor = selectedItem ? (selectedItem.color || 'white') : 'white';
    const colorIndex = colors.indexOf(currentColor);
    const colorNumber = colorIndex === -1 ? 8 : colorIndex + 1; // Default to white (8) if not found
    const colorDisplay = (chalk as any)[currentColor] ? (chalk as any)[currentColor](currentColor) : chalk.white(currentColor);

    return (
        <Box flexDirection='column'>
            <Text bold>Configure Colors</Text>
            <Text dimColor>↑↓ to select item, Enter to cycle color, ESC to go back</Text>
            {selectedItem && (
                <Box marginTop={1}>
                    <Text>Current color ({colorNumber}/{colors.length}): {colorDisplay}</Text>
                </Box>
            )}
            <Box marginTop={1}>
                <SelectInput
                    items={menuItems}
                    onSelect={handleSelect}
                    onHighlight={handleHighlight}
                    initialIndex={selectedIndex}
                />
            </Box>
        </Box>
    );
};

const App: React.FC = () => {
    const { exit } = useApp();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [screen, setScreen] = useState<'main' | 'lines' | 'items' | 'colors' | 'confirm'>('main');
    const [selectedLine, setSelectedLine] = useState(0);
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
                <Text bold color='cyan'>🎨 CCStatusline Configuration</Text>
            </Box>

            <Box marginBottom={1}>
                <Text dimColor>Preview:</Text>
            </Box>
            <StatusLinePreview lines={settings.lines || [[]]} terminalWidth={terminalWidth} />

            <Box marginTop={2}>
                {screen === 'main' && <MainMenu onSelect={handleMainMenuSelect} isClaudeInstalled={isClaudeInstalled} hasChanges={hasChanges} />}
                {screen === 'lines' && (
                    <LineSelector
                        lines={settings.lines || [[]]}
                        onSelect={handleLineSelect}
                        onBack={() => setScreen('main')}
                    />
                )}
                {screen === 'items' && settings.lines && (
                    <ItemsEditor
                        items={settings.lines[selectedLine] || []}
                        onUpdate={(items) => updateLine(selectedLine, items)}
                        onBack={() => setScreen('lines')}
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
                                for (let itemIndex = 0; itemIndex < newLines[lineIndex].length; itemIndex++) {
                                    if (flatIndex < items.length) {
                                        newLines[lineIndex][itemIndex] = items[flatIndex];
                                        flatIndex++;
                                    }
                                }
                            }
                            setSettings({ ...settings, lines: newLines });
                        }}
                        onBack={() => setScreen('main')}
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
    render(<App />);
}