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

export interface ConfirmDialogProps {
    message?: string;
    onConfirm: () => void;
    onCancel: () => void;
    inline?: boolean;
}

const CONFIRM_OPTIONS: ListEntry<boolean>[] = [
    {
        label: 'Yes',
        value: true
    },
    {
        label: 'No',
        value: false
    }
];

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel, inline = false }) => {
    useInput((_, key) => {
        if (key.escape) {
            onCancel();
        }
    });

    if (inline) {
        return (
            <List
                items={CONFIRM_OPTIONS}
                onSelect={(confirmed) => {
                    if (confirmed) {
                        onConfirm();
                        return;
                    }

                    onCancel();
                }}
                color='cyan'
            />
        );
    }

    return (
        <Box flexDirection='column'>
            <Text>{message}</Text>
            <Box marginTop={1}>
                <List
                    items={CONFIRM_OPTIONS}
                    onSelect={(confirmed) => {
                        if (confirmed) {
                            onConfirm();
                            return;
                        }

                        onCancel();
                    }}
                    color='cyan'
                />
            </Box>
        </Box>
    );
};