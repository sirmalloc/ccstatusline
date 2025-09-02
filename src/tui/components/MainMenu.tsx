import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { Settings } from '../../types/Settings';
import { type PowerlineFontStatus } from '../../utils/powerline';

import { List } from './List';

export interface MainMenuProps {
    onSelect: (value: string, index: number) => void;
    isClaudeInstalled: boolean;
    hasChanges: boolean;
    initialSelection?: number;
    powerlineFontStatus: PowerlineFontStatus;
    settings: Settings | null;
    previewIsTruncated?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
    onSelect,
    isClaudeInstalled,
    hasChanges,
    initialSelection = 0,
    powerlineFontStatus,
    settings,
    previewIsTruncated
}) => {
    // Build menu structure with visual gaps
    const menuItems = [
        {
            label: '📝 Edit Lines',
            value: 'lines',
            selectable: true,
            description:
        'Configure up to 3 status lines with various widgets like model info, git status, and token usage'
        },
        {
            label: '🎨 Edit Colors',
            value: 'colors',
            selectable: true,
            description:
        'Customize colors for each widget including foreground, background, and bold styling'
        },
        {
            label: '⚡ Powerline Setup',
            value: 'powerline',
            selectable: true,
            description:
        'Install Powerline fonts for enhanced visual separators and symbols in your status line'
        },
        '-' as const,
        {
            label: '💻 Terminal Options',
            value: 'terminalConfig',
            selectable: true,
            description: 'Configure terminal-specific settings for optimal display'
        },
        {
            label: '🌐 Global Overrides',
            value: 'globalOverrides',
            selectable: true,
            description:
        'Set global padding, separators, and color overrides that apply to all widgets'
        },
        '-' as const,
        {
            label: isClaudeInstalled
                ? '🔌 Uninstall from Claude Code'
                : '📦 Install to Claude Code',
            value: 'install',
            selectable: true,
            description: isClaudeInstalled
                ? 'Remove ccstatusline from your Claude Code settings'
                : 'Add ccstatusline to your Claude Code settings for automatic status line rendering'
        }
    ];

    if (hasChanges) {
        menuItems.push(
            {
                label: '💾 Save & Exit',
                value: 'save',
                selectable: true,
                description: 'Save all changes and exit the configuration tool'
            },
            {
                label: '❌ Exit without saving',
                value: 'exit',
                selectable: true,
                description: 'Exit without saving your changes'
            }
        );
    } else {
        menuItems.push({
            label: '🚪 Exit',
            value: 'exit',
            selectable: true,
            description: 'Exit the configuration tool'
        });
    }

    // Check if we should show the truncation warning
    const showTruncationWarning
    = previewIsTruncated && settings?.flexMode === 'full-minus-40';

    return (
        <Box flexDirection='column'>
            {showTruncationWarning && (
                <Box marginBottom={1}>
                    <Text color='yellow'>
                        ⚠ Some lines are truncated, see Terminal Options → Terminal Width
                        for info
                    </Text>
                </Box>
            )}

            <Text bold>Main Menu</Text>

            <List
                items={menuItems}
                marginTop={1}
                onSelect={onSelect}
                initialSelection={initialSelection}
            />
        </Box>
    );
};