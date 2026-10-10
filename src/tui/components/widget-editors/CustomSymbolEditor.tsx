import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../../types/Widget';
import { shouldInsertInput } from '../../../utils/input-guards';

import { getGraphemes } from './text-cursor';

export const CustomSymbolEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [symbol, setSymbol] = useState(widget.customSymbol ?? '');

    useInput((input, key) => {
        if (key.return) {
            onComplete({ ...widget, customSymbol: symbol });
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace || key.delete) {
            setSymbol('');
        } else if (shouldInsertInput(input, key)) {
            // Take only the first grapheme (handles multi-byte emojis correctly)
            const firstGrapheme = getGraphemes(input)[0] ?? '';
            setSymbol(firstGrapheme);
        }
    });

    return (
        <Box flexDirection='column'>
            <Text>
                Enter custom symbol:
                {' '}
                {symbol ? (
                    <Text inverse>{symbol}</Text>
                ) : (
                    <Text inverse dimColor>(empty)</Text>
                )}
            </Text>
            <Text dimColor>Type any character or emoji, Backspace clear, Enter save, ESC cancel</Text>
        </Box>
    );
};
