import {
    Box,
    Text
} from 'ink';
import React from 'react';

import { List } from './List';

export type ScopeSwitchStage = 'unsaved' | 'seed';
export type ScopeSwitchChoice = 'save' | 'discard' | 'copy' | 'defaults' | 'cancel';

export interface ScopeSwitchMenuProps {
    stage: ScopeSwitchStage;
    onSelect: (choice: ScopeSwitchChoice) => void;
}

export function getScopeSwitchMenuItems(stage: ScopeSwitchStage): { label: string; value: ScopeSwitchChoice }[] {
    if (stage === 'unsaved') {
        return [
            { label: '💾 Save and switch', value: 'save' },
            { label: '🗑️  Discard and switch', value: 'discard' },
            { label: '❌ Cancel', value: 'cancel' }
        ];
    }

    return [
        { label: '📋 Copy current global config', value: 'copy' },
        { label: '✨ Start with defaults', value: 'defaults' },
        { label: '❌ Cancel', value: 'cancel' }
    ];
}

export const ScopeSwitchMenu: React.FC<ScopeSwitchMenuProps> = ({ stage, onSelect }) => {
    const title = stage === 'unsaved'
        ? 'You have unsaved changes'
        : 'No project config found in this directory';

    return (
        <Box flexDirection='column'>
            <Text bold>{title}</Text>
            <Box marginTop={1} flexDirection='column'>
                <List
                    items={getScopeSwitchMenuItems(stage)}
                    onSelect={(value) => {
                        onSelect(value === 'back' ? 'cancel' : value);
                    }}
                />
            </Box>
        </Box>
    );
};
