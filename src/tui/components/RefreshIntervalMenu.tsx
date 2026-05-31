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

type ConfigureStatusLineValue = 'refreshInterval' | 'gitCacheTtl';

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

function getGitCacheTtlSublabel(ttlSeconds: number): string {
    return ttlSeconds === 0
        ? '(mtime only)'
        : `(${ttlSeconds}s)`;
}

export function buildConfigureStatusLineItems(
    refreshInterval: number | null,
    supportsRefreshInterval: boolean,
    gitCacheTtlSeconds: number
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
        },
        {
            label: '🧮 Git Cache TTL',
            sublabel: getGitCacheTtlSublabel(gitCacheTtlSeconds),
            value: 'gitCacheTtl',
            description: 'How long git widget subprocess output can be reused while .git/HEAD and .git/index are unchanged. Enter 0-60 seconds;\n0 disables age-based expiry, so cached output is reused until those git metadata mtimes change.'
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

export function validateGitCacheTtlInput(value: string): string | null {
    const parsed = parseInt(value, 10);

    if (value === '' || isNaN(parsed)) {
        return 'Please enter a valid number';
    }

    if (parsed < 0) {
        return `Minimum Git cache TTL is 0s (you entered ${parsed}s)`;
    }

    if (parsed > 60) {
        return `Maximum Git cache TTL is 60s (you entered ${parsed}s)`;
    }

    return null;
}

export interface RefreshIntervalMenuProps {
    currentInterval: number | null;
    supportsRefreshInterval: boolean;
    gitCacheTtlSeconds: number;
    onUpdate: (interval: number | null) => void;
    onGitCacheTtlUpdate: (ttlSeconds: number) => void;
    onBack: () => void;
}

export const RefreshIntervalMenu: React.FC<RefreshIntervalMenuProps> = ({
    currentInterval,
    supportsRefreshInterval,
    gitCacheTtlSeconds,
    onUpdate,
    onGitCacheTtlUpdate,
    onBack
}) => {
    const [editingRefreshInterval, setEditingRefreshInterval] = useState(false);
    const [editingGitCacheTtl, setEditingGitCacheTtl] = useState(false);
    const [refreshInput, setRefreshInput] = useState(() => getRefreshInputValue(currentInterval));
    const [gitCacheTtlInput, setGitCacheTtlInput] = useState(() => String(gitCacheTtlSeconds));
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

        if (editingGitCacheTtl) {
            if (key.return) {
                const error = validateGitCacheTtlInput(gitCacheTtlInput);

                if (error) {
                    setValidationError(error);
                } else {
                    const value = parseInt(gitCacheTtlInput, 10);
                    onGitCacheTtlUpdate(value);
                    setEditingGitCacheTtl(false);
                    setValidationError(null);
                }
            } else if (key.escape) {
                setGitCacheTtlInput(String(gitCacheTtlSeconds));
                setEditingGitCacheTtl(false);
                setValidationError(null);
            } else if (key.backspace) {
                setGitCacheTtlInput(gitCacheTtlInput.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // No cursor position in simple input
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                const newValue = gitCacheTtlInput + input;
                if (newValue.length <= 2) {
                    setGitCacheTtlInput(newValue);
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
            ) : editingGitCacheTtl ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter Git cache TTL in seconds (0-60):
                        {' '}
                        {gitCacheTtlInput}
                        {gitCacheTtlInput.length > 0 ? 's' : ''}
                    </Text>
                    <Text> </Text>
                    <Text dimColor wrap='wrap'>
                        This affects how quickly git widgets notice unstaged and untracked working-tree changes.
                    </Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>
                            0 disables age-based expiry; cache validity uses .git/HEAD and .git/index mtimes only.
                        </Text>
                    )}
                    <Text dimColor>Press Enter to confirm, ESC to cancel.</Text>
                </Box>
            ) : (
                <List
                    marginTop={1}
                    items={buildConfigureStatusLineItems(currentInterval, supportsRefreshInterval, gitCacheTtlSeconds)}
                    onSelect={(value) => {
                        if (value === 'back') {
                            onBack();
                            return;
                        }

                        if (value === 'refreshInterval') {
                            setRefreshInput(getRefreshInputValue(currentInterval));
                            setEditingRefreshInterval(true);
                            return;
                        }

                        setGitCacheTtlInput(String(gitCacheTtlSeconds));
                        setEditingGitCacheTtl(true);
                    }}
                    showBackButton={true}
                />
            )}
        </Box>
    );
};
