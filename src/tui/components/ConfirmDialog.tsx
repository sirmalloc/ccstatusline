import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

export interface ConfirmDialogProps {
    message?: string;
    onConfirm: () => void;
    onCancel: () => void;
    inline?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel, inline = false }) => {
    const [selectedIndex, setSelectedIndex] = useState(0); // Default to "Yes"

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
        } else if (key.downArrow) {
            setSelectedIndex(Math.min(1, selectedIndex + 1));
        } else if (key.return) {
            if (selectedIndex === 0) {
                onConfirm();
            } else {
                onCancel();
            }
        } else if (key.escape) {
            onCancel();
        }
    });

    const renderOptions = () => {
        const yesStyle = selectedIndex === 0 ? { color: 'cyan' } : {};
        const noStyle = selectedIndex === 1 ? { color: 'cyan' } : {};

        return (
            <Box flexDirection='column'>
                <Text {...yesStyle}>
                    {selectedIndex === 0 ? '▶ ' : '  '}
                    Yes
                </Text>
                <Text {...noStyle}>
                    {selectedIndex === 1 ? '▶ ' : '  '}
                    No
                </Text>
            </Box>
        );
    };

    if (inline) {
        return renderOptions();
    }

    return (
        <Box flexDirection='column'>
            <Text>{message}</Text>
            <Box marginTop={1}>
                {renderOptions()}
            </Box>
        </Box>
    );
};