import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import type { WidgetItem } from '../../types/Widget';
import {
    clearLabel,
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
    const { getText, display, handleInput } = useTextCursor(getLabel(widget, defaultLabel));

    useInput((input, key) => {
        if (key.return) {
            onComplete(setLabel(widget, getText()));
        } else if (key.escape) {
            onCancel();
        } else if (key.tab) {
            onComplete(clearLabel(widget));
        } else {
            handleInput(input, key);
        }
    });

    // Quoted so trailing spaces, which usually separate the label from the
    // value, stay visible. One Text, because Ink measures a toned or joined
    // emoji as several columns and a sibling Text would overwrite its end.
    return (
        <Box flexDirection='column'>
            <Text bold>Label</Text>
            <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Tab reset to default, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text>
                    {`"${display}"`}
                    <Text dimColor>{` (default: ${JSON.stringify(defaultLabel)})`}</Text>
                </Text>
            </Box>
        </Box>
    );
};
