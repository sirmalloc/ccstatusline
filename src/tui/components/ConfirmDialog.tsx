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
    /**
     * ESC handler, when backing out differs from answering "No". Defaults to onCancel.
     * A dialog whose "No" still commits something needs this to offer a real way out.
     */
    onEscape?: () => void;
    /**
     * Which option starts highlighted. Defaults to 'yes'; use 'no' when the dialog is
     * reached by the same key that confirms it, so a repeated press cannot destroy data.
     */
    defaultChoice?: 'yes' | 'no';
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

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel, onEscape, defaultChoice = 'yes', inline = false }) => {
    useInput((_, key) => {
        if (key.escape) {
            (onEscape ?? onCancel)();
        }
    });

    const handleSelect = (confirmed: boolean | 'back') => {
        if (confirmed === true) {
            onConfirm();
            return;
        }

        onCancel();
    };
    const initialSelection = defaultChoice === 'no' ? 1 : 0;

    if (inline) {
        return (
            <List
                items={CONFIRM_OPTIONS}
                onSelect={handleSelect}
                initialSelection={initialSelection}
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
                    onSelect={handleSelect}
                    initialSelection={initialSelection}
                    color='cyan'
                />
            </Box>
        </Box>
    );
};
