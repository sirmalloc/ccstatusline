import * as fs from 'fs';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import type { ClaudeSettings } from '../../types/ClaudeSettings';
import {
    getClaudeLocalSettingsPath,
    getClaudeSettingsPath
} from '../../utils/claude-settings';

import { List } from './List';

export interface FileTargetSelectProps {
    onSelect: (targetPath: string) => void;
    onCancel: () => void;
}

export const FileTargetSelect: React.FC<FileTargetSelectProps> = ({
    onSelect,
    onCancel
}) => {
    useInput((_, key) => {
        if (key.escape) {
            onCancel();
        }
    });

    const globalPath = getClaudeSettingsPath();
    const localPath = getClaudeLocalSettingsPath();

    // Check if local already has a statusLine — installing to global would be overridden
    let localHasStatusLine = false;
    try {
        const content = fs.readFileSync(localPath, 'utf-8');
        const data = JSON.parse(content) as ClaudeSettings;
        localHasStatusLine = !!data.statusLine?.command;
    } catch {
        // file unreadable — no warning needed
    }

    const items = [
        {
            label: 'settings.json',
            sublabel: localHasStatusLine
                ? '(will be overridden by settings.local.json)'
                : '(default)',
            value: 'global'
        },
        { label: 'settings.local.json', sublabel: '(local override)', value: 'local' }
    ];

    return (
        <Box flexDirection='column'>
            <Text bold>settings.local.json detected</Text>
            <Box marginTop={1}>
                <Text dimColor>Select which file to install to:</Text>
            </Box>
            <List
                color='blue'
                marginTop={1}
                items={items}
                onSelect={(value) => {
                    if (value === 'back') {
                        onCancel();
                        return;
                    }
                    onSelect(value === 'local' ? localPath : globalPath);
                }}
                showBackButton={true}
            />
            <Box marginTop={1}>
                <Text dimColor>Press Enter to select, ESC to go back</Text>
            </Box>
        </Box>
    );
};
