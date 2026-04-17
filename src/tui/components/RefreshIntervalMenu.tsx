import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { shouldInsertInput } from '../../utils/input-guards';

import {
    List,
    type ListEntry
} from './List';

type ConfigureStatusLineValue = 'refreshInterval';

function getRefreshInputValue(interval: number | null): string {
    return interval === null ? '' : String(interval);
}

function getRefreshIntervalSublabel(interval: number | null, supported: boolean): string {
    if (!supported) {
        return '(requires Claude Code >=2.1.97)';
    }

    if (interval === null) {
        return '(not set)';
    }

    return `(${interval}s)`;
}

export function buildConfigureStatusLineItems(
    refreshInterval: number | null,
    supportsRefreshInterval: boolean
): ListEntry<ConfigureStatusLineValue>[] {
    return [
        {
            label: '🔄 Refresh Interval',
            sublabel: getRefreshIntervalSublabel(refreshInterval, supportsRefreshInterval),
            value: 'refreshInterval',
            disabled: !supportsRefreshInterval,
            description: supportsRefreshInterval
                ? 'How often Claude Code refreshes the status line by re-running the command. Enter value in seconds (1-60), or leave empty to remove.'
                : 'This setting requires Claude Code version 2.1.97 or later. Please update Claude Code to use this feature.'
        }
    ];
}

export function validateRefreshIntervalInput(value: string): string | null {
    if (value === '') {
        return null;
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return 'Please enter a valid number';
    }

    if (parsed < 1) {
        return `Minimum interval is 1s (you entered ${parsed}s)`;
    }

    if (parsed > 60) {
        return `Maximum interval is 60s (you entered ${parsed}s)`;
    }

    return null;
}

export interface RefreshIntervalMenuProps {
    currentInterval: number | null;
    supportsRefreshInterval: boolean;
    onUpdate: (interval: number | null) => void;
    onBack: () => void;
}

export const RefreshIntervalMenu: React.FC<RefreshIntervalMenuProps> = ({
    currentInterval,
    supportsRefreshInterval,
    onUpdate,
    onBack
}) => {
    const [editingRefreshInterval, setEditingRefreshInterval] = useState(false);
    const [refreshInput, setRefreshInput] = useState(() => getRefreshInputValue(currentInterval));
    const [validationError, setValidationError] = useState<string | null>(null);

    useInput((input, key) => {
        if (editingRefreshInterval) {
            if (key.return) {
                if (refreshInput === '') {
                    onUpdate(null);
                    setEditingRefreshInterval(false);
                    setValidationError(null);
                    return;
                }

                const error = validateRefreshIntervalInput(refreshInput);

                if (error) {
                    setValidationError(error);
                } else {
                    const value = parseInt(refreshInput, 10);
                    onUpdate(value);
                    setEditingRefreshInterval(false);
                    setValidationError(null);
                }
            } else if (key.escape) {
                setRefreshInput(getRefreshInputValue(currentInterval));
                setEditingRefreshInterval(false);
                setValidationError(null);
            } else if (key.backspace) {
                setRefreshInput(refreshInput.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // No cursor position in simple input
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                const newValue = refreshInput + input;
                if (newValue.length <= 2) {
                    setRefreshInput(newValue);
                    setValidationError(null);
                }
            }
            return;
        }

        if (key.escape) {
            onBack();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Configure Status Line</Text>
            <Text color='white'>Configure Claude Code status line settings</Text>

            {editingRefreshInterval ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter refresh interval in seconds (1-60):
                        {' '}
                        {refreshInput}
                        {refreshInput.length > 0 ? 's' : ''}
                    </Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>Press Enter to confirm, ESC to cancel. Leave empty to remove.</Text>
                    )}
                </Box>
            ) : (
                <List
                    marginTop={1}
                    items={buildConfigureStatusLineItems(currentInterval, supportsRefreshInterval)}
                    onSelect={(value) => {
                        if (value === 'back') {
                            onBack();
                            return;
                        }

                        setRefreshInput(getRefreshInputValue(currentInterval));
                        setEditingRefreshInterval(true);
                    }}
                    showBackButton={true}
                />
            )}
        </Box>
    );
};