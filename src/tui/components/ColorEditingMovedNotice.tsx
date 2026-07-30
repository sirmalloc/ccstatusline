import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import {
    List,
    type ListEntry
} from './List';

export type ColorEditingMovedAction = 'widgetEditor' | 'back';

export interface ColorEditingMovedNoticeProps {
    onGoToWidgetEditor: () => void;
    onBack: () => void;
}

const MOVED_OPTIONS: ListEntry<ColorEditingMovedAction>[] = [
    {
        label: '📝 Go to Widget Editor',
        value: 'widgetEditor',
        description: 'Pick a line to edit its widgets, then press Tab to edit their colors'
    },
    {
        label: '← Back',
        value: 'back',
        description: 'Return to the main menu'
    }
];

export const ColorEditingMovedNotice: React.FC<ColorEditingMovedNoticeProps> = ({ onGoToWidgetEditor, onBack }) => {
    useInput((_, key) => {
        if (key.escape) {
            onBack();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Edit Colors</Text>
            <Box marginTop={1} flexDirection='column'>
                <Text color='yellow'>Color editing has moved into the Widget Editor.</Text>
                <Text dimColor>Highlight a widget there and press Tab to switch between its items and its colors.</Text>
            </Box>
            <List
                marginTop={1}
                items={MOVED_OPTIONS}
                onSelect={(value) => {
                    if (value === 'widgetEditor') {
                        onGoToWidgetEditor();
                        return;
                    }

                    onBack();
                }}
                color='cyan'
            />
        </Box>
    );
};
