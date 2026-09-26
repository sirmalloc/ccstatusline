import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';

const MaxWidthEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [widthInput, setWidthInput] = useState(widget.maxWidth?.toString() ?? '');

    useInput((input, key) => {
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
    });

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
};

export default MaxWidthEditor;
