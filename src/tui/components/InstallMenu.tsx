import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import { getClaudeSettingsPath } from '../../utils/claude-settings';

import { List } from './List';

export interface InstallMenuProps {
    bunxAvailable: boolean;
    existingStatusLine: string | null;
    onSelectNpx: () => void;
    onSelectBunx: () => void;
    onCancel: () => void;
    initialSelection?: number;
}

export const InstallMenu: React.FC<InstallMenuProps> = ({
    bunxAvailable,
    existingStatusLine,
    onSelectNpx,
    onSelectBunx,
    onCancel,
    initialSelection = 0
}) => {
    useInput((_, key) => {
        if (key.escape) {
            onCancel();
        }
    });

    function onSelect(value: string) {
        switch (value) {
            case 'npx':
                onSelectNpx();
                break;
            case 'bunx':
                if (bunxAvailable) {
                    onSelectBunx();
                }
                break;
            case 'back':
                onCancel();
                break;
        }
    }

    const listItems = [
        {
            label: 'npx - Node Package Execute',
            value: 'npx'
        },
        {
            label: 'bunx - Bun Package Execute',
            sublabel: bunxAvailable ? undefined : '(not installed)',
            value: 'bunx',
            disabled: !bunxAvailable
        }
    ];

    return (
        <Box flexDirection='column'>
            <Text bold>Install ccstatusline to Claude Code</Text>

            {existingStatusLine && (
                <Box marginBottom={1}>
                    <Text color='yellow'>
                        ⚠ Current status line: "
                        {existingStatusLine}
                        "
                    </Text>
                </Box>
            )}

            <Box>
                <Text dimColor>Select package manager to use:</Text>
            </Box>

            <List
                color='blue'
                marginTop={1}
                items={listItems}
                onSelect={(line) => {
                    if (line === 'back') {
                        onCancel();
                        return;
                    }

                    onSelect(line);
                }}
                initialSelection={initialSelection}
                showBackButton={true}
            />

            <Box marginTop={2}>
                <Text dimColor>
                    The selected command will be written to
                    {' '}
                    {getClaudeSettingsPath()}
                </Text>
            </Box>

            <Box marginTop={1}>
                <Text dimColor>Press Enter to select, ESC to cancel</Text>
            </Box>
        </Box>
    );
};