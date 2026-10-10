import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../../types/Widget';
import { shouldInsertInput } from '../../../utils/input-guards';
import {
    buildMetadata,
    isValidHttpUrl,
    toEditorMetadata
} from '../../../widgets/Link';

type LinkEditorMode = 'url' | 'text';

function getEditorMode(action?: string): LinkEditorMode {
    if (action === 'edit-url') {
        return 'url';
    }
    return 'text';
}

export const LinkEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const initial = toEditorMetadata(widget);
    const mode = getEditorMode(action);

    const [urlInput, setUrlInput] = useState(initial.url);
    const [urlCursorPos, setUrlCursorPos] = useState(initial.url.length);
    const [textInput, setTextInput] = useState(initial.text);
    const [textCursorPos, setTextCursorPos] = useState(initial.text.length);

    const isUrlMode = mode === 'url';
    const activeValue = isUrlMode ? urlInput : textInput;
    const activeCursor = isUrlMode ? urlCursorPos : textCursorPos;

    const updateActiveValue = (value: string, cursor: number) => {
        if (isUrlMode) {
            setUrlInput(value);
            setUrlCursorPos(cursor);
        } else {
            setTextInput(value);
            setTextCursorPos(cursor);
        }
    };

    useInput((input, key) => {
        if (key.return) {
            onComplete(buildMetadata(widget, urlInput, textInput));
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow) {
            updateActiveValue(activeValue, Math.max(0, activeCursor - 1));
        } else if (key.rightArrow) {
            updateActiveValue(activeValue, Math.min(activeValue.length, activeCursor + 1));
        } else if (key.backspace) {
            if (activeCursor > 0) {
                const value = activeValue.slice(0, activeCursor - 1) + activeValue.slice(activeCursor);
                updateActiveValue(value, activeCursor - 1);
            }
        } else if (key.delete) {
            if (activeCursor < activeValue.length) {
                const value = activeValue.slice(0, activeCursor) + activeValue.slice(activeCursor + 1);
                updateActiveValue(value, activeCursor);
            }
        } else if (shouldInsertInput(input, key)) {
            const value = activeValue.slice(0, activeCursor) + input + activeValue.slice(activeCursor);
            updateActiveValue(value, activeCursor + input.length);
        }
    });

    const showInvalidUrlWarning = isUrlMode && urlInput.trim().length > 0 && !isValidHttpUrl(urlInput.trim());
    const prompt = isUrlMode ? 'Enter URL (http/https): ' : 'Enter link text (blank uses URL): ';

    return (
        <Box flexDirection='column'>
            <Text>
                {prompt}
                {activeValue.slice(0, activeCursor)}
                <Text backgroundColor='gray' color='black'>{activeValue[activeCursor] ?? ' '}</Text>
                {activeValue.slice(activeCursor + 1)}
            </Text>
            {isUrlMode ? (
                <Text dimColor>
                    Current text:
                    {' '}
                    {textInput.trim() || '(uses URL)'}
                </Text>
            ) : (
                <Text dimColor>
                    Current URL:
                    {' '}
                    {urlInput.trim() || '(none)'}
                </Text>
            )}
            {showInvalidUrlWarning && (
                <Text color='yellow'>URL must begin with http:// or https://</Text>
            )}
            <Text dimColor>←→ move cursor, Enter save, ESC cancel</Text>
        </Box>
    );
};
