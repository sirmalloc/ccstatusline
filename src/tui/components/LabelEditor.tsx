import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';
import {
    getLabel,
    setLabel
} from '../../widgets/shared/raw-or-labeled';

export interface LabelEditorProps {
    widget: WidgetItem;
    defaultLabel: string;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

function dropLastGrapheme(str: string): string {
    const graphemes = 'Segmenter' in Intl
        ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str), seg => seg.segment)
        : Array.from(str);
    return graphemes.slice(0, -1).join('');
}

export const LabelEditor: React.FC<LabelEditorProps> = ({ widget, defaultLabel, onComplete, onCancel }) => {
    const [text, setText] = useState(() => getLabel(widget, defaultLabel));

    useInput((input, key) => {
        if (key.return) {
            onComplete(setLabel(widget, defaultLabel, text));
        } else if (key.escape) {
            onCancel();
        } else if (key.tab) {
            setText(defaultLabel);
        } else if (key.backspace || key.delete) {
            setText(dropLastGrapheme(text));
        } else if (shouldInsertInput(input, key)) {
            setText(text + input);
        }
    });

    // Quoted so trailing spaces, which usually separate the label from the
    // value, stay visible
    return (
        <Box flexDirection='column'>
            <Text bold>Label</Text>
            <Text dimColor>Type to edit, Backspace delete, Tab default, Enter save, ESC cancel</Text>
            <Box marginTop={1} flexDirection='row' flexWrap='nowrap'>
                <Text>"</Text>
                <Text>{text}</Text>
                <Text inverse> </Text>
                <Text>"</Text>
                <Text dimColor>{` (default: "${defaultLabel}")`}</Text>
            </Box>
        </Box>
    );
};
