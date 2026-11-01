import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import type { WidgetEditorProps } from '../../../types/Widget';

import { useTextCursor } from './text-cursor';

export const CustomTextEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const { getText, display, handleInput } = useTextCursor(widget.customText ?? '');

    useInput((input, key) => {
        if (key.return) {
            onComplete({ ...widget, customText: getText() });
        } else if (key.escape) {
            onCancel();
        } else {
            handleInput(input, key);
        }
    });

    return (
        <Box flexDirection='column'>
            <Text>{`Enter custom text: ${display}`}</Text>
            <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
        </Box>
    );
};
