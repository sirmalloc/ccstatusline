import {
    Box,
    Text
} from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

export interface ConfirmDialogProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => {
    const items = [
        { label: '✅ Yes', value: 'yes' },
        { label: '❌ No', value: 'no' }
    ];

    return (
        <Box flexDirection='column'>
            <Text>{message}</Text>
            <Box marginTop={1}>
                <SelectInput
                    items={items}
                    onSelect={(item) => {
                        if (item.value === 'yes') {
                            onConfirm();
                        } else {
                            onCancel();
                        }
                    }}
                />
            </Box>
        </Box>
    );
};