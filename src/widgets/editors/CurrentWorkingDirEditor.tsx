import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';

const CurrentWorkingDirEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [segmentsInput, setSegmentsInput] = useState(widget.metadata?.segments ?? '');

    useInput((input, key) => {
        if (action === 'edit-segments') {
            if (key.return) {
                const segments = parseInt(segmentsInput, 10);
                if (!isNaN(segments) && segments > 0) {
                    onComplete({
                        ...widget,
                        metadata: {
                            ...widget.metadata,
                            segments: segments.toString()
                        }
                    });
                } else {
                    // Clear segments if blank or invalid
                    const { segments, ...restMetadata } = widget.metadata ?? {};
                    onComplete({
                        ...widget,
                        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
                    });
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setSegmentsInput(segmentsInput.slice(0, -1));
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                setSegmentsInput(segmentsInput + input);
            }
        }
    });

    if (action === 'edit-segments') {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter number of segments to display (blank for full path): </Text>
                    <Text>{segmentsInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};

export default CurrentWorkingDirEditor;
