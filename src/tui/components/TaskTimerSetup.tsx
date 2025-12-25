import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useEffect,
    useState
} from 'react';

import {
    getTimingHookPath,
    installTaskTimer,
    isTaskTimerInstalled,
    uninstallTaskTimer
} from '../../utils/claude-settings';

import { ConfirmDialog } from './ConfirmDialog';

export interface TaskTimerSetupProps { onBack: () => void }

export const TaskTimerSetup: React.FC<TaskTimerSetupProps> = ({ onBack }) => {
    const [isInstalled, setIsInstalled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [confirmingInstall, setConfirmingInstall] = useState(false);
    const [confirmingUninstall, setConfirmingUninstall] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [installMessage, setInstallMessage] = useState<string | null>(null);

    // Check installation status on mount
    useEffect(() => {
        const checkStatus = async () => {
            setIsLoading(true);
            const installed = await isTaskTimerInstalled();
            setIsInstalled(installed);
            setIsLoading(false);
        };
        void checkStatus();
    }, []);

    useInput((input, key) => {
        // Block input when showing install message
        if (installMessage) {
            // Clear message on any key press
            if (!key.escape) {
                setInstallMessage(null);
            }
            return;
        }

        // Skip input handling when confirmations are active
        if (confirmingInstall || confirmingUninstall || installing) {
            return;
        }

        if (key.escape) {
            onBack();
        } else if (input === 'i' || input === 'I') {
            if (!isInstalled) {
                setConfirmingInstall(true);
            }
        } else if (input === 'u' || input === 'U') {
            if (isInstalled) {
                setConfirmingUninstall(true);
            }
        }
    });

    const handleInstall = async () => {
        setConfirmingInstall(false);
        setInstalling(true);
        try {
            await installTaskTimer();
            setIsInstalled(true);
            setInstallMessage('Task Timer hooks installed successfully! The widget will now work in ccstatusline.');
        } catch (error) {
            setInstallMessage(
                `Failed to install Task Timer hooks: ${error instanceof Error ? error.message : String(error)}`
            );
        } finally {
            setInstalling(false);
        }
    };

    const handleUninstall = async () => {
        setConfirmingUninstall(false);
        setInstalling(true);
        try {
            await uninstallTaskTimer();
            setIsInstalled(false);
            setInstallMessage('Task Timer hooks uninstalled successfully.');
        } catch (error) {
            setInstallMessage(
                `Failed to uninstall Task Timer hooks: ${error instanceof Error ? error.message : String(error)}`
            );
        } finally {
            setInstalling(false);
        }
    };

    if (isLoading) {
        return (
            <Box flexDirection='column'>
                <Text>Checking Task Timer installation status...</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            {!confirmingInstall && !confirmingUninstall && !installing && !installMessage && (
                <Text bold>Task Timer Setup</Text>
            )}

            {confirmingInstall ? (
                <Box flexDirection='column'>
                    <Box marginBottom={1}>
                        <Text color='cyan' bold>Task Timer Installation</Text>
                    </Box>

                    <Box marginBottom={1} flexDirection='column'>
                        <Text bold>What will happen:</Text>
                        <Text dimColor>
                            • Copy timing_hook.sh to
                            {getTimingHookPath()}
                        </Text>
                        <Text dimColor>• Update Claude Code settings.json with hooks configuration</Text>
                        <Text dimColor>• Add UserPromptSubmit, Stop, and SessionEnd hooks</Text>
                    </Box>

                    <Box marginBottom={1} flexDirection='column'>
                        <Text color='green' bold>Features:</Text>
                        <Text dimColor>• Real-time task execution timer in status line</Text>
                        <Text dimColor>• Shows elapsed time while Claude is working</Text>
                        <Text dimColor>• Displays total duration when task completes</Text>
                        <Text dimColor>• Multi-session support (each Claude instance has independent timer)</Text>
                    </Box>

                    <Box marginBottom={1}>
                        <Text color='yellow' bold>Requirements: </Text>
                        <Text dimColor>Bash shell, Write permissions to ~/.claude/</Text>
                    </Box>

                    <Box marginTop={1}>
                        <Text>Proceed with installation? </Text>
                    </Box>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={() => { void handleInstall(); }}
                            onCancel={() => {
                                setConfirmingInstall(false);
                            }}
                        />
                    </Box>
                </Box>
            ) : confirmingUninstall ? (
                <Box flexDirection='column'>
                    <Box marginBottom={1}>
                        <Text color='yellow' bold>Uninstall Task Timer</Text>
                    </Box>

                    <Box marginBottom={1}>
                        <Text>This will remove the timing_hook.sh script and clean up hooks configuration.</Text>
                    </Box>

                    <Box marginTop={1}>
                        <Text>Are you sure you want to uninstall? </Text>
                    </Box>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={() => { void handleUninstall(); }}
                            onCancel={() => {
                                setConfirmingUninstall(false);
                            }}
                        />
                    </Box>
                </Box>
            ) : installing ? (
                <Box>
                    <Text color='yellow'>
                        {isInstalled ? 'Uninstalling' : 'Installing'}
                        {' '}
                        Task Timer hooks...
                    </Text>
                </Box>
            ) : installMessage ? (
                <Box flexDirection='column'>
                    <Text color={installMessage.includes('success') ? 'green' : 'red'}>
                        {installMessage}
                    </Text>
                    <Box marginTop={1}>
                        <Text dimColor>Press any key to continue...</Text>
                    </Box>
                </Box>
            ) : (
                <>
                    <Box marginTop={1} flexDirection='column'>
                        <Text>
                            {'  Installation Status: '}
                            {isInstalled ? (
                                <>
                                    <Text color='green'>✓ Installed</Text>
                                </>
                            ) : (
                                <>
                                    <Text color='yellow'>✗ Not Installed</Text>
                                </>
                            )}
                        </Text>
                    </Box>

                    {isInstalled ? (
                        <Box marginTop={1} flexDirection='column'>
                            <Text dimColor>
                                Hook location:
                                {getTimingHookPath()}
                            </Text>
                            <Text dimColor>Hooks configured: UserPromptSubmit, Stop, SessionEnd</Text>
                        </Box>
                    ) : null}

                    <Box marginTop={2} flexDirection='column'>
                        {isInstalled ? (
                            <>
                                <Text>
                                    <Text color='green'>(i)</Text>
                                    <Text dimColor> Task Timer is ready to use</Text>
                                </Text>
                                <Text>
                                    <Text color='yellow'>(u)</Text>
                                    <Text dimColor> Uninstall Task Timer hooks</Text>
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text>
                                    <Text color='cyan'>(i)</Text>
                                    <Text dimColor> Install Task Timer hooks</Text>
                                </Text>
                            </>
                        )}
                        <Box marginTop={1}>
                            <Text dimColor>Press ESC to go back</Text>
                        </Box>
                    </Box>
                </>
            )}
        </Box>
    );
};