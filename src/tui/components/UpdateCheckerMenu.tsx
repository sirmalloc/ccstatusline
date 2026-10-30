import {
    Box,
    Text,
    useInput
} from 'ink';
import React from 'react';

import type {
    UpdateAction,
    UpdateCheckResult
} from '../../utils/update-checker';

import {
    List,
    type ListEntry
} from './List';

export type UpdateCheckerState = { status: 'checking' } | UpdateCheckResult;

export interface UpdateCheckerMenuProps {
    state: UpdateCheckerState;
    onBack: () => void;
    onRefresh: () => void;
    onRunAction: (action: UpdateAction) => void;
}

type UpdateMenuAction = UpdateAction | 'refresh';

function getInstallationLabel(result: UpdateCheckResult): string {
    const { installation } = result;
    if (installation.method === 'auto-update') {
        return `Auto-update via ${installation.packageManager}`;
    }

    if (installation.method === 'pinned') {
        const version = installation.installedVersion
            ? ` ${installation.installedVersion}`
            : '';
        const manager = installation.packageManager === 'unknown'
            ? ''
            : ` via ${installation.packageManager}`;

        return `Pinned global install${manager}${version}`;
    }

    if (installation.method === 'self-managed') {
        return 'Self-managed/global install';
    }

    return 'Unknown or not installed';
}

function getActionLabel(action: UpdateAction): string {
    return `Run ${action.command}`;
}

function getActionSublabel(action: UpdateAction): string | undefined {
    if (action.available) {
        return undefined;
    }

    return action.packageManager === 'npm'
        ? '(npm not installed)'
        : '(bun not installed)';
}

function getActionItems(actions: UpdateAction[]): ListEntry<UpdateMenuAction>[] {
    return [
        ...actions.map((action): ListEntry<UpdateMenuAction> => ({
            label: getActionLabel(action),
            value: action,
            disabled: !action.available,
            sublabel: getActionSublabel(action)
        })),
        {
            label: 'Check again',
            value: 'refresh'
        }
    ];
}

export const UpdateCheckerMenu: React.FC<UpdateCheckerMenuProps> = ({
    state,
    onBack,
    onRefresh,
    onRunAction
}) => {
    useInput((_, key) => {
        if (key.escape) {
            onBack();
        }
    });

    if (state.status === 'checking') {
        return (
            <Box flexDirection='column'>
                <Text bold>Check for Updates</Text>
                <Box marginTop={1}>
                    <Text dimColor>Checking npm registry...</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Check for Updates</Text>

            <Box marginTop={1} flexDirection='column'>
                <Text>
                    Current:
                    {' '}
                    {state.currentVersion}
                </Text>
                {state.status !== 'registry-failure' && (
                    <Text>
                        Latest:
                        {' '}
                        {state.latestVersion}
                    </Text>
                )}
                <Text>
                    Install:
                    {' '}
                    {getInstallationLabel(state)}
                </Text>
            </Box>

            {state.status === 'registry-failure' && (
                <>
                    <Box marginTop={1}>
                        <Text color='red'>
                            Registry check failed:
                            {' '}
                            {state.errorMessage}
                        </Text>
                    </Box>
                    <List
                        marginTop={1}
                        items={[{ label: 'Check again', value: 'refresh' }]}
                        onSelect={(value) => {
                            if (value === 'back') {
                                onBack();
                                return;
                            }

                            onRefresh();
                        }}
                        showBackButton={true}
                    />
                </>
            )}

            {state.status === 'up-to-date' && (
                <>
                    <Box marginTop={1}>
                        <Text color='green'>ccstatusline is up to date.</Text>
                    </Box>
                    <List
                        marginTop={1}
                        items={[{ label: 'Check again', value: 'refresh' }]}
                        onSelect={(value) => {
                            if (value === 'back') {
                                onBack();
                                return;
                            }

                            onRefresh();
                        }}
                        showBackButton={true}
                    />
                </>
            )}

            {state.status === 'update-available' && (
                <>
                    <Box marginTop={1}>
                        <Text color='yellow'>An update is available.</Text>
                    </Box>

                    {state.installation.method === 'auto-update' && (
                        <Box marginTop={1} flexDirection='column'>
                            <Text>No manual hook change is needed. Claude Code already runs @latest.</Text>
                            <Text>The next @latest invocation will resolve the latest package.</Text>
                            <Text>
                                Launch command for a fresh TUI:
                                {' '}
                                {state.autoUpdateLaunchCommand}
                            </Text>
                        </Box>
                    )}

                    {state.actions.length > 0 && (
                        <List
                            marginTop={1}
                            items={getActionItems(state.actions)}
                            onSelect={(value) => {
                                if (value === 'back') {
                                    onBack();
                                    return;
                                }

                                if (value === 'refresh') {
                                    onRefresh();
                                    return;
                                }

                                onRunAction(value);
                            }}
                            showBackButton={true}
                        />
                    )}

                    {state.actions.length === 0 && (
                        <List
                            marginTop={1}
                            items={[{ label: 'Check again', value: 'refresh' }]}
                            onSelect={(value) => {
                                if (value === 'back') {
                                    onBack();
                                    return;
                                }

                                onRefresh();
                            }}
                            showBackButton={true}
                        />
                    )}
                </>
            )}
        </Box>
    );
};
