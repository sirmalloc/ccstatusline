import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';
import {
    DEFAULT_SPEED_WINDOW_SECONDS,
    MAX_SPEED_WINDOW_SECONDS,
    MIN_SPEED_WINDOW_SECONDS,
    getWidgetSpeedWindowSeconds,
    withWidgetSpeedWindowSeconds
} from '../../utils/speed-window';
import { WINDOW_EDITOR_ACTION } from '../shared/speed-widget';

const SpeedWindowEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [windowInput, setWindowInput] = useState(getWidgetSpeedWindowSeconds(widget).toString());

    useInput((input, key) => {
        if (action !== WINDOW_EDITOR_ACTION) {
            return;
        }

        if (key.return) {
            const parsedWindow = Number.parseInt(windowInput, 10);
            const nextWindow = Number.isFinite(parsedWindow)
                ? parsedWindow
                : DEFAULT_SPEED_WINDOW_SECONDS;

            onComplete(withWidgetSpeedWindowSeconds(widget, nextWindow));
            return;
        }

        if (key.escape) {
            onCancel();
            return;
        }

        if (key.backspace) {
            setWindowInput(windowInput.slice(0, -1));
            return;
        }

        if (shouldInsertInput(input, key) && /\d/.test(input)) {
            setWindowInput(windowInput + input);
        }
    });

    if (action !== WINDOW_EDITOR_ACTION) {
        return <Text>Unknown editor mode</Text>;
    }

    return (
        <Box flexDirection='column'>
            <Box>
                <Text>
                    Enter window in seconds (
                    {MIN_SPEED_WINDOW_SECONDS}
                    -
                    {MAX_SPEED_WINDOW_SECONDS}
                    ):
                    {' '}
                </Text>
                <Text>{windowInput}</Text>
                <Text backgroundColor='gray' color='black'>{' '}</Text>
            </Box>
            <Text dimColor>0 disables window mode and averages the full session. Press Enter to save, ESC to cancel.</Text>
        </Box>
    );
};

export default SpeedWindowEditor;
