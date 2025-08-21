import { execSync } from 'child_process';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

export class CustomCommandWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Executes a custom shell command and displays output'; }
    getDisplayName(): string { return 'Custom Command'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const cmd = item.commandPath ?? 'No command';
        const truncatedCmd = cmd.length > 20 ? `${cmd.substring(0, 17)}...` : cmd;
        const displayText = `${this.getDisplayName()} (${truncatedCmd})`;

        // Build modifiers string
        const modifiers: string[] = [];
        if (item.maxWidth) {
            modifiers.push(`max:${item.maxWidth}`);
        }
        if (item.timeout && item.timeout !== 1000) {
            modifiers.push(`timeout:${item.timeout}ms`);
        }
        if (item.preserveColors) {
            modifiers.push('preserve');
        }

        return {
            displayText,
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-preserve') {
            return { ...item, preserveColors: !item.preserveColors };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.commandPath ? `[cmd: ${item.commandPath.substring(0, 20)}${item.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
        } else if (item.commandPath && context.data) {
            try {
                const timeout = item.timeout ?? 1000;
                const jsonInput = JSON.stringify(context.data);
                let output = execSync(item.commandPath, {
                    encoding: 'utf8',
                    input: jsonInput,
                    timeout: timeout,
                    stdio: ['pipe', 'pipe', 'ignore'],
                    env: process.env
                }).trim();

                // Strip ANSI codes if preserveColors is false
                if (!item.preserveColors) {
                    // Strip all ANSI escape sequences
                    output = output.replace(/\x1b\[[0-9;]*m/g, '');
                }

                if (item.maxWidth && output.length > item.maxWidth) {
                    output = output.substring(0, item.maxWidth - 3) + '...';
                }

                return output || null;
            } catch (error) {
                // Provide more specific error messages
                if (error instanceof Error) {
                    const execError = error as Error & {
                        code?: string;
                        signal?: string;
                        status?: number;
                    };
                    if (execError.code === 'ENOENT') {
                        return '[Cmd not found]';
                    } else if (execError.code === 'ETIMEDOUT') {
                        return '[Timeout]';
                    } else if (execError.code === 'EACCES') {
                        return '[Permission denied]';
                    } else if (execError.signal) {
                        return `[Signal: ${execError.signal}]`;
                    } else if (execError.status !== undefined) {
                        return `[Exit: ${execError.status}]`;
                    }
                }
                return '[Error]';
            }
        }
        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'e', label: '(e)dit cmd', action: 'edit-command' },
            { key: 'w', label: '(w)idth', action: 'edit-width' },
            { key: 't', label: '(t)imeout', action: 'edit-timeout' },
            { key: 'p', label: '(p)reserve colors', action: 'toggle-preserve' }
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <CustomCommandEditor {...props} />;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean {
        // Only supports colors if preserveColors is false
        return !item.preserveColors;
    }
}

interface EditorMode { type: 'command' | 'width' | 'timeout' | null }

const CustomCommandEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const getMode = (): EditorMode['type'] => {
        switch (action) {
        case 'edit-command': return 'command';
        case 'edit-width': return 'width';
        case 'edit-timeout': return 'timeout';
        default: return 'command';
        }
    };
    const mode = getMode();
    const [commandInput, setCommandInput] = useState(widget.commandPath ?? '');
    const [commandCursorPos, setCommandCursorPos] = useState(commandInput.length);
    const [widthInput, setWidthInput] = useState(widget.maxWidth?.toString() ?? '');
    const [timeoutInput, setTimeoutInput] = useState(widget.timeout?.toString() ?? '1000');

    useInput((input, key) => {
        if (mode === 'command') {
            if (key.return) {
                onComplete({ ...widget, commandPath: commandInput });
            } else if (key.escape) {
                onCancel();
            } else if (key.leftArrow) {
                setCommandCursorPos(Math.max(0, commandCursorPos - 1));
            } else if (key.rightArrow) {
                setCommandCursorPos(Math.min(commandInput.length, commandCursorPos + 1));
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
        } else if (mode === 'width') {
            if (key.return) {
                const width = parseInt(widthInput, 10);
                if (!isNaN(width) && width > 0) {
                    onComplete({ ...widget, maxWidth: width });
                } else {
                    const { maxWidth, ...rest } = widget;
                    void maxWidth; // Intentionally unused
                    onComplete(rest);
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setWidthInput(widthInput.slice(0, -1));
            } else if (input && /\d/.test(input)) {
                setWidthInput(widthInput + input);
            }
        } else if (mode === 'timeout') {
            if (key.return) {
                const timeout = parseInt(timeoutInput, 10);
                if (!isNaN(timeout) && timeout > 0) {
                    onComplete({ ...widget, timeout });
                } else {
                    const { timeout, ...rest } = widget;
                    void timeout; // Intentionally unused
                    onComplete(rest);
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setTimeoutInput(timeoutInput.slice(0, -1));
            } else if (input && /\d/.test(input)) {
                setTimeoutInput(timeoutInput + input);
            }
        }
    });

    if (mode === 'command') {
        return (
            <Box flexDirection='column'>
                <Text>
                    Enter command path:
                    {' '}
                    {commandInput.slice(0, commandCursorPos)}
                    <Text backgroundColor='gray' color='black'>{commandInput[commandCursorPos] ?? ' '}</Text>
                    {commandInput.slice(commandCursorPos + 1)}
                </Text>
                <Text dimColor>←→ move cursor, Enter save, ESC cancel</Text>
            </Box>
        );
    } else if (mode === 'width') {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter max width (blank for no limit): </Text>
                    <Text>{widthInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    } else if (mode === 'timeout') {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter timeout in milliseconds (default 1000): </Text>
                    <Text>{timeoutInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};