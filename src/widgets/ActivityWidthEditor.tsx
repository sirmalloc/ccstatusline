import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../types/Widget';
import { shouldInsertInput } from '../utils/input-guards';

export const ActivityWidthEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [widthInput, setWidthInput] = useState(widget.maxWidth?.toString() ?? '');

    useInput((input, key) => {
        if (action !== 'edit-width') {
            if (key.escape || key.return) {
                onCancel();
            }
            return;
        }

        if (key.return) {
            const width = parseInt(widthInput, 10);
            if (!Number.isNaN(width) && width > 0) {
                onComplete({ ...widget, maxWidth: width });
            } else {
                const { maxWidth, ...rest } = widget;
                void maxWidth;
                onComplete(rest);
            }
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setWidthInput(widthInput.slice(0, -1));
        } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
            setWidthInput(widthInput + input);
        }
    });

    if (action !== 'edit-width') {
        return <Text>Unknown editor mode</Text>;
    }

    return (
        <Box flexDirection='column'>
            <Box>
                <Text>Enter max width (blank or 0 for no limit): </Text>
                <Text>{widthInput}</Text>
                <Text backgroundColor='gray' color='black'>{' '}</Text>
            </Box>
            <Text dimColor>Press Enter to save, ESC to cancel</Text>
        </Box>
    );
};