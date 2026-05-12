import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { InstallationMetadata } from '../../types/Settings';
import {
    CCSTATUSLINE_COMMANDS,
    PINNED_INSTALL_COMMANDS,
    getClaudeSettingsPath,
    type PackageCommandAvailability,
    type StatusLineCommandMode
} from '../../utils/claude-settings';

import {
    List,
    type ListEntry
} from './List';

export type InstallUpdateStyle = 'auto-update' | 'pinned';
export type InstallPackageManager = 'npm' | 'bun';

export interface InstallSelection {
    updateStyle: InstallUpdateStyle;
    packageManager: InstallPackageManager;
    commandMode: StatusLineCommandMode;
    metadata: InstallationMetadata;
    displayedCommand: string;
    globalInstallCommand?: string;
}

export interface InstallMenuProps {
    commandAvailability: PackageCommandAvailability;
    currentVersion: string;
    existingStatusLine: string | null;
    onSelect: (selection: InstallSelection) => void;
    onCancel: () => void;
    initialPackageSelection?: number;
}

type InstallStep = 'style' | 'manager';

const AUTO_UPDATE_DESCRIPTION = 'Runs `@latest` through npx/bunx. Stays current automatically, with a small startup cost when the package runner checks or resolves the package. Because it follows the latest published package, pinned install is available if you prefer explicit updates.';

function getPinnedDescription(currentVersion: string): string {
    return `Installs \`ccstatusline@${currentVersion}\` globally and Claude Code runs \`ccstatusline\`. Fast per-render and only changes when you update.`;
}

function getStyleItems(currentVersion: string): ListEntry<InstallUpdateStyle>[] {
    return [
        {
            label: 'Auto-update',
            value: 'auto-update',
            description: AUTO_UPDATE_DESCRIPTION
        },
        {
            label: 'Pinned global install',
            value: 'pinned',
            description: getPinnedDescription(currentVersion)
        }
    ];
}

function getManagerItems(
    updateStyle: InstallUpdateStyle,
    commandAvailability: PackageCommandAvailability,
    currentVersion: string
): ListEntry<InstallPackageManager>[] {
    if (updateStyle === 'auto-update') {
        return [
            {
                label: CCSTATUSLINE_COMMANDS.AUTO_NPX,
                value: 'npm',
                disabled: !commandAvailability.npx,
                sublabel: commandAvailability.npx ? undefined : '(npx not installed)'
            },
            {
                label: CCSTATUSLINE_COMMANDS.AUTO_BUNX,
                value: 'bun',
                disabled: !commandAvailability.bunx,
                sublabel: commandAvailability.bunx ? undefined : '(bunx not installed)'
            }
        ];
    }

    return [
        {
            label: PINNED_INSTALL_COMMANDS.NPM(currentVersion),
            value: 'npm',
            disabled: !commandAvailability.npm,
            sublabel: commandAvailability.npm ? undefined : '(npm not installed)'
        },
        {
            label: PINNED_INSTALL_COMMANDS.BUN(currentVersion),
            value: 'bun',
            disabled: !commandAvailability.bun,
            sublabel: commandAvailability.bun ? undefined : '(bun not installed)'
        }
    ];
}

function buildSelection(
    updateStyle: InstallUpdateStyle,
    packageManager: InstallPackageManager,
    currentVersion: string
): InstallSelection {
    if (updateStyle === 'auto-update') {
        return {
            updateStyle,
            packageManager,
            commandMode: packageManager === 'bun' ? 'auto-bunx' : 'auto-npx',
            displayedCommand: packageManager === 'bun'
                ? CCSTATUSLINE_COMMANDS.AUTO_BUNX
                : CCSTATUSLINE_COMMANDS.AUTO_NPX,
            metadata: {
                method: 'auto-update',
                packageManager
            }
        };
    }

    return {
        updateStyle,
        packageManager,
        commandMode: 'global',
        displayedCommand: packageManager === 'bun'
            ? PINNED_INSTALL_COMMANDS.BUN(currentVersion)
            : PINNED_INSTALL_COMMANDS.NPM(currentVersion),
        globalInstallCommand: packageManager === 'bun'
            ? PINNED_INSTALL_COMMANDS.BUN(currentVersion)
            : PINNED_INSTALL_COMMANDS.NPM(currentVersion),
        metadata: {
            method: 'pinned',
            installedVersion: currentVersion
        }
    };
}

export const InstallMenu: React.FC<InstallMenuProps> = ({
    commandAvailability,
    currentVersion,
    existingStatusLine,
    onSelect,
    onCancel,
    initialPackageSelection = 0
}) => {
    const [step, setStep] = useState<InstallStep>('style');
    const [updateStyle, setUpdateStyle] = useState<InstallUpdateStyle>('auto-update');

    useInput((_, key) => {
        if (key.escape) {
            if (step === 'manager') {
                setStep('style');
                return;
            }

            onCancel();
        }
    });

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

            {step === 'style' && (
                <>
                    <Box>
                        <Text dimColor>Select update style:</Text>
                    </Box>

                    <List
                        color='blue'
                        marginTop={1}
                        items={getStyleItems(currentVersion)}
                        onSelect={(value) => {
                            if (value === 'back') {
                                onCancel();
                                return;
                            }

                            setUpdateStyle(value);
                            setStep('manager');
                        }}
                        initialSelection={0}
                        showBackButton={true}
                    />
                </>
            )}

            {step === 'manager' && (
                <>
                    <Box>
                        <Text dimColor>Select package manager:</Text>
                    </Box>

                    <List
                        color='blue'
                        marginTop={1}
                        items={getManagerItems(updateStyle, commandAvailability, currentVersion)}
                        onSelect={(value) => {
                            if (value === 'back') {
                                setStep('style');
                                return;
                            }

                            onSelect(buildSelection(updateStyle, value, currentVersion));
                        }}
                        initialSelection={initialPackageSelection}
                        showBackButton={true}
                    />
                </>
            )}

            <Box marginTop={2}>
                <Text dimColor>
                    The selected command will be written to
                    {' '}
                    {getClaudeSettingsPath()}
                </Text>
            </Box>

            <Box marginTop={1}>
                <Text dimColor>Press Enter to select, ESC to go back</Text>
            </Box>
        </Box>
    );
};
