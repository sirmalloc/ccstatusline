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

export interface ConfirmDialogAdditionalAction {
    label: string;
    onSelect: () => void;
}

export interface ConfirmDialogProps {
    message?: string;
    onConfirm: () => void;
    onCancel: () => void;
    inline?: boolean;
    /** Optional middle choice (e.g. "Keep existing") shown between Yes and No. */
    additionalAction?: ConfirmDialogAdditionalAction;
    // While the confirmed action runs: replace Yes/No with a working line and ignore ESC
    busy?: boolean;
}

type ConfirmOptionValue = boolean | 'additional';

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel, inline = false, additionalAction, busy = false }) => {
    useInput((_, key) => {
        if (key.escape && !busy) {
            onCancel();
        }
    });

    const options: ListEntry<ConfirmOptionValue>[] = [
        {
            label: 'Yes',
            value: true
        },
        ...(additionalAction
            ? [{
                label: additionalAction.label,
                value: 'additional' as const
            }]
            : []),
        {
            label: additionalAction ? 'Cancel' : 'No',
            value: false
        }
    ];

    const handleSelect = (value: ConfirmOptionValue | 'back') => {
        if (value === true) {
            onConfirm();
            return;
        }

        if (value === 'additional') {
            additionalAction?.onSelect();
            return;
        }

        onCancel();
    };

    if (inline) {
        return (
            <List
                items={options}
                onSelect={handleSelect}
                color='cyan'
            />
        );
    }

    return (
        <Box flexDirection='column'>
            <Text>{message}</Text>
            <Box marginTop={1}>
                {busy ? (
                    <Text color='yellow'>Working... This may take a moment.</Text>
                ) : (
                    <List
                        items={options}
                        onSelect={handleSelect}
                        color='cyan'
                    />
                )}
            </Box>
        </Box>
    );
};
