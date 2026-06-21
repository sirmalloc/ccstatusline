import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { shouldInsertInput } from '../../utils/input-guards';

interface ImportConfigDialogProps {
    onFileChosen: (filePath: string) => void;
    onCancel: () => void;
}

export function ImportConfigDialog({ onFileChosen, onCancel }: ImportConfigDialogProps): React.JSX.Element {
    const [inputValue, setInputValue] = useState('');

    useInput((input, key) => {
        if (key.return) {
            onFileChosen(inputValue);
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setInputValue(inputValue.slice(0, -1));
        } else if (shouldInsertInput(input, key)) {
            setInputValue(inputValue + input);
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Import Config</Text>
            <Text dimColor>Enter the file path to import configuration from:</Text>
            <Box marginTop={1}>
                <Text>Path: </Text>
                <Text>{inputValue}</Text>
                <Text inverse> </Text>
            </Box>
            <Box marginTop={1}>
                <Text dimColor>Enter to confirm, Escape to cancel</Text>
            </Box>
        </Box>
    );
}
