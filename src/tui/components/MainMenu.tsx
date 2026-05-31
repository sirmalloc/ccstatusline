import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type {
    InstallationMetadata,
    Settings
} from '../../types/Settings';
import { type PowerlineFontStatus } from '../../utils/powerline';

import { List } from './List';

export type MainMenuOption = 'lines'
    | 'colors'
    | 'powerline'
    | 'terminalConfig'
    | 'globalOverrides'
    | 'install'
    | 'manageInstallation'
    | 'checkUpdates'
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
    installation?: InstallationMetadata;
    previewIsTruncated?: boolean;
}

interface MainMenuItem {
    label: string;
    sublabel?: string;
    disabled?: boolean;
    value: MainMenuOption;
    description: string;
}

export type MainMenuEntry = MainMenuItem | '-';

function usesManageInstallation(installation?: InstallationMetadata): boolean {
    return installation?.method === 'pinned' || installation?.method === 'self-managed';
}

function getInstallationMenuItem(
    isClaudeInstalled: boolean,
    installation?: InstallationMetadata
): MainMenuItem {
    if (!isClaudeInstalled) {
        return {
            label: '📦 Install to Claude Code',
            value: 'install',
            description: 'Add ccstatusline to your Claude Code settings for automatic status line rendering'
        };
    }

    if (usesManageInstallation(installation)) {
        return {
            label: '🧰 Manage Installation',
            value: 'manageInstallation',
            description: 'Check pinned global package updates or uninstall ccstatusline'
        };
    }

    return {
        label: '🔌 Uninstall from Claude Code',
        value: 'install',
        description: 'Remove ccstatusline from your Claude Code settings'
    };
}

export function buildMainMenuItems(
    isClaudeInstalled: boolean,
    hasChanges: boolean,
    installation?: InstallationMetadata
): MainMenuEntry[] {
    const menuItems: MainMenuEntry[] = [
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
        '-',
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
        {
            label: '🔧 Configure Status Line',
            sublabel: isClaudeInstalled ? undefined : '(install first)',
            disabled: !isClaudeInstalled,
            value: 'configureStatusLine',
            description: 'Configure Claude Code status line settings like refresh interval'
        },
        '-',
        getInstallationMenuItem(isClaudeInstalled, installation)
    ];

    if (hasChanges) {
        menuItems.push(
            '-',
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
            '-',
            {
                label: '⭐ Like ccstatusline? Star us on GitHub',
                value: 'starGithub',
                description: 'Open the ccstatusline GitHub repository in your browser so you can star the project'
            }
        );
    } else {
        menuItems.push(
            '-',
            {
                label: '🚪 Exit',
                value: 'exit',
                description: 'Exit the configuration tool'
            },
            '-',
            {
                label: '⭐ Like ccstatusline? Star us on GitHub',
                value: 'starGithub',
                description: 'Open the ccstatusline GitHub repository in your browser so you can star the project'
            }
        );
    }

    return menuItems;
}

export function getMainMenuSelectionIndex(items: MainMenuEntry[], option: MainMenuOption): number {
    let selectionIndex = 0;

    for (const item of items) {
        if (item === '-') {
            continue;
        }

        if (item.value === option) {
            return selectionIndex;
        }

        if (!item.disabled) {
            selectionIndex += 1;
        }
    }

    return 0;
}

export function getMainMenuInstallSelectionIndex(
    isClaudeInstalled: boolean,
    installation?: InstallationMetadata
): number {
    const option = isClaudeInstalled && usesManageInstallation(installation)
        ? 'manageInstallation'
        : 'install';

    return getMainMenuSelectionIndex(buildMainMenuItems(isClaudeInstalled, false, installation), option);
}

export const MainMenu: React.FC<MainMenuProps> = ({
    onSelect,
    isClaudeInstalled,
    hasChanges,
    initialSelection = 0,
    powerlineFontStatus,
    settings,
    installation,
    previewIsTruncated
}) => {
    const menuItems = buildMainMenuItems(isClaudeInstalled, hasChanges, installation);

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
