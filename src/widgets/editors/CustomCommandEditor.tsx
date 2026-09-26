import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';

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
            } else if (shouldInsertInput(input, key)) {
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
                    onComplete(rest);
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setWidthInput(widthInput.slice(0, -1));
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                setWidthInput(widthInput + input);
            }
        } else if (mode === 'timeout') {
            if (key.return) {
                const timeout = parseInt(timeoutInput, 10);
                if (!isNaN(timeout) && timeout > 0) {
                    onComplete({ ...widget, timeout });
                } else {
                    const { timeout, ...rest } = widget;
                    onComplete(rest);
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setTimeoutInput(timeoutInput.slice(0, -1));
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
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

export default CustomCommandEditor;
