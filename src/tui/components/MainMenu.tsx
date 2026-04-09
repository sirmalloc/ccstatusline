import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { Settings } from '../../types/Settings';
import { type PowerlineFontStatus } from '../../utils/powerline';

import { List } from './List';

export type MainMenuOption = 'lines'
    | 'colors'
    | 'powerline'
    | 'terminalConfig'
    | 'globalOverrides'
    | 'install'
    | 'configureStatusLine'
    | 'starGithub'
    | 'save'
    | 'exit';

export interface MainMenuProps {
    onSelect: (value: MainMenuOption, index: number) => void;
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
    const menuItems: ({
        label: string;
        value: MainMenuOption;
        description: string;
    } | '-')[] = [
        {
            label: '📝 Edit Lines',
            value: 'lines',
            description:
                'Configure any number of status lines with various widgets like model info, git status, and token usage'
        },
        {
            label: '🎨 Edit Colors',
            value: 'colors',
            description:
                'Customize colors for each widget including foreground, background, and bold styling'
        },
        {
            label: '⚡ Powerline Setup',
            value: 'powerline',
            description:
                'Install Powerline fonts for enhanced visual separators and symbols in your status line'
        },
        '-' as const,
        {
            label: '💻 Terminal Options',
            value: 'terminalConfig',
            description: 'Configure terminal-specific settings for optimal display'
        },
        {
            label: '🌐 Global Overrides',
            value: 'globalOverrides',
            description:
                'Set global padding, separators, and color overrides that apply to all widgets'
        },
        '-' as const,
        ...(isClaudeInstalled
            ? [
                {
                    label: '🔧 Configure Status Line',
                    value: 'configureStatusLine' as MainMenuOption,
                    description: 'Configure Claude Code status line settings like refresh interval'
                },
                {
                    label: '🔌 Uninstall from Claude Code',
                    value: 'install' as MainMenuOption,
                    description: 'Remove ccstatusline from your Claude Code settings'
                }
            ]
            : [
                {
                    label: '📦 Install to Claude Code',
                    value: 'install' as MainMenuOption,
                    description: 'Add ccstatusline to your Claude Code settings for automatic status line rendering'
                }
            ]
        )
    ];

    if (hasChanges) {
        menuItems.push(
            {
                label: '💾 Save & Exit',
                value: 'save',
                description: 'Save all changes and exit the configuration tool'
            },
            {
                label: '❌ Exit without saving',
                value: 'exit',
                description: 'Exit without saving your changes'
            },
            '-' as const,
            {
                label: '⭐ Like ccstatusline? Star us on GitHub',
                value: 'starGithub',
                description: 'Open the ccstatusline GitHub repository in your browser so you can star the project'
            }
        );
    } else {
        menuItems.push(
            {
                label: '🚪 Exit',
                value: 'exit',
                description: 'Exit the configuration tool'
            },
            '-' as const,
            {
                label: '⭐ Like ccstatusline? Star us on GitHub',
                value: 'starGithub',
                description: 'Open the ccstatusline GitHub repository in your browser so you can star the project'
            }
        );
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
                onSelect={(value, index) => {
                    if (value === 'back') {
                        return;
                    }

                    onSelect(value, index);
                }}
                initialSelection={initialSelection}
            />
        </Box>
    );
};