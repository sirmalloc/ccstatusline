import {
    Box,
    Text,
    useInput
} from 'ink';
import * as os from 'os';
import * as path from 'path';
import React, { useState } from 'react';

import { shouldInsertInput } from '../../utils/input-guards';

interface ExportConfigDialogProps {
    onExport: (filePath: string) => void;
    onCancel: () => void;
}

const DEFAULT_EXPORT_PATH = path.join(os.homedir(), 'ccstatusline-config.json');

export function ExportConfigDialog({ onExport, onCancel }: ExportConfigDialogProps): React.JSX.Element {
    const [inputValue, setInputValue] = useState(DEFAULT_EXPORT_PATH);

    useInput((input, key) => {
        if (key.return) {
            onExport(inputValue);
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
            <Text bold>Export Config</Text>
            <Text dimColor>Enter the file path to export your configuration to:</Text>
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
