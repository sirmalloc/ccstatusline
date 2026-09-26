import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';
import {
    EDIT_LIST_LIMIT_ACTION,
    parseListLimit,
    setListLimit
} from '../Skills';

const SkillsEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [limitInput, setLimitInput] = useState(() => parseListLimit(widget).toString());

    useInput((input, key) => {
        if (action !== EDIT_LIST_LIMIT_ACTION) {
            return;
        }

        if (key.return) {
            const parsed = parseInt(limitInput, 10);
            const limit = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
            onComplete(setListLimit(widget, limit));
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setLimitInput(limitInput.slice(0, -1));
        } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
            setLimitInput(limitInput + input);
        }
    });

    if (action === EDIT_LIST_LIMIT_ACTION) {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter max skills to show (0 for unlimited): </Text>
                    <Text>{limitInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};

export default SkillsEditor;
