import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';

const CustomSymbolEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [symbol, setSymbol] = useState(widget.customSymbol ?? '');

    // Helper to get grapheme segments if Intl.Segmenter is available
    const getFirstGrapheme = (str: string): string => {
        if (str.length === 0) {
            return '';
        }

        if ('Segmenter' in Intl) {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            const segments = Array.from(segmenter.segment(str));
            return segments[0]?.segment ?? '';
        }

        // Fallback: just take first character
        return Array.from(str)[0] ?? '';
    };

    useInput((input, key) => {
        if (key.return) {
            onComplete({ ...widget, customSymbol: symbol });
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace || key.delete) {
            setSymbol('');
        } else if (shouldInsertInput(input, key)) {
            // Take only the first grapheme (handles multi-byte emojis correctly)
            const firstGrapheme = getFirstGrapheme(input);
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

export default CustomSymbolEditor;
