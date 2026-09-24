import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import type { WidgetItem } from '../../types/Widget';
import {
    getLabel,
    setLabel
} from '../../widgets/shared/raw-or-labeled';
import { useTextCursor } from '../../widgets/shared/text-cursor';

export interface LabelEditorProps {
    widget: WidgetItem;
    defaultLabel: string;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

export const LabelEditor: React.FC<LabelEditorProps> = ({ widget, defaultLabel, onComplete, onCancel }) => {
    const { text, display, setText, handleInput } = useTextCursor(getLabel(widget, defaultLabel));

    useInput((input, key) => {
        if (key.return) {
            onComplete(setLabel(widget, defaultLabel, text));
        } else if (key.escape) {
            onCancel();
        } else if (key.tab) {
            setText(defaultLabel);
        } else {
            handleInput(input, key);
        }
    });

    // Quoted so trailing spaces, which usually separate the label from the
    // value, stay visible
    return (
        <Box flexDirection='column'>
            <Text bold>Label</Text>
            <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Tab default, Enter save, ESC cancel</Text>
            <Box marginTop={1} flexDirection='row' flexWrap='nowrap'>
                <Text>{`"${display}"`}</Text>
                <Text dimColor>{` (default: "${defaultLabel}")`}</Text>
            </Box>
        </Box>
    );
};
