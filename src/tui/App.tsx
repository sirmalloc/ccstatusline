import chalk from 'chalk';
import {
    Box,
    Text,
    render,
    useApp,
    useInput
} from 'ink';
import Gradient from 'ink-gradient';
import React, {
    useCallback,
    useEffect,
    useState
} from 'react';

import type {
    InstallationMetadata,
    ResolvedInstallationMetadata,
    Settings
} from '../types/Settings';
import type { WidgetItem } from '../types/Widget';
import {
    buildStatusLineCommand,
    classifyInstallation,
    getClaudeSettingsPath,
    getExistingStatusLine,
    getPackageCommandAvailability,
    installStatusLine,
    isClaudeCodeVersionAtLeast,
    isInstalled,
    isKnownCommand,
    setRefreshInterval,
    uninstallStatusLine
} from '../utils/claude-settings';
import { cloneSettings } from '../utils/clone-settings';
import {
    getConfigPath,
    isCustomConfigPath,
    loadSettings,
    saveInstallationMetadata,
    saveSettings
} from '../utils/config';
import {
    inspectGlobalCommandResolution,
    isPathInsideDir
} from '../utils/global-command-resolution';
import {
    inspectActiveGlobalCommand,
    inspectGlobalPackageInstallations,
    runGlobalPackageUninstall,
    type ActiveGlobalCommandResolution,
    type GlobalPackageInstallation,
    type GlobalPackageManager
} from '../utils/global-package-manager';
import { openExternalUrl } from '../utils/open-url';
import {
    checkPowerlineFonts,
    checkPowerlineFontsAsync,
    installPowerlineFonts,
    type PowerlineFontStatus
} from '../utils/powerline';
import { getPackageVersion } from '../utils/terminal';
import {
    checkForUpdates,
    compareVersions,
    runGlobalPackageInstall,
    runGlobalUpdateAction,
    type UpdateAction
} from '../utils/update-checker';

import { loadClaudeStatusLineState } from './claude-status';
import {
    ColorMenu,
    ConfirmDialog,
    GlobalOverridesMenu,
    InstallMenu,
    ItemsEditor,
    LineSelector,
    MainMenu,
    ManageInstallationMenu,
    PowerlineSetup,
    RefreshIntervalMenu,
    StatusLinePreview,
    TerminalOptionsMenu,
    TerminalWidthMenu,
    UninstallMenu,
    UpdateCheckerMenu,
    getMainMenuInstallSelectionIndex,
    type InstallSelection,
    type MainMenuOption,
    type UninstallSelection,
    type UpdateCheckerState
} from './components';
import {
    List,
    type ListEntry
} from './components/List';

const GITHUB_REPO_URL = 'https://github.com/sirmalloc/ccstatusline';

interface FlashMessage {
    text: string;
    color: 'green' | 'red' | 'yellow';
}

type AppScreen = 'main'
    | 'lines'
    | 'items'
    | 'colorLines'
    | 'colors'
    | 'terminalWidth'
    | 'terminalConfig'
    | 'globalOverrides'
    | 'confirm'
    | 'powerline'
    | 'install'
    | 'flowNotice'
    | 'manageInstallation'
    | 'uninstallOptions'
    | 'updates'
    | 'refreshInterval';

type PinnedVersionMismatchAction = 'update' | 'exit';

interface ConfirmDialogState {
    message: string;
    action: () => Promise<void>;
    cancelScreen?: Exclude<AppScreen, 'confirm'>;
}

interface FlowNoticeState {
    title: string;
    message: string;
    color: 'green' | 'red' | 'yellow';
    continueScreen: Exclude<AppScreen, 'confirm' | 'flowNotice'>;
}

type FlowNoticeProps = FlowNoticeState & { onContinue: () => void };

const NOTICE_ITEMS: ListEntry<string>[] = [
    {
        label: 'Continue',
        value: 'continue'
    }
];

interface PinnedVersionMismatch {
    packageManager: GlobalPackageManager;
    installedVersion: string;
    runningVersion: string;
    relaunchCommand: string;
    canUpdateToRunningVersion: boolean;
}

interface PinnedVersionMismatchScreenProps {
    mismatch: PinnedVersionMismatch;
    canRunPackageManager: boolean;
    onUpdate: () => void;
    onExit: () => void;
}

const FlowNotice: React.FC<FlowNoticeProps> = ({
    title,
    message,
    color,
    onContinue
}) => {
    useInput((_, key) => {
        if (key.escape) {
            onContinue();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>{title}</Text>
            <Box marginTop={1}>
                <Text color={color} wrap='wrap'>{message}</Text>
            </Box>
            <List
                marginTop={1}
                items={NOTICE_ITEMS}
                onSelect={() => { onContinue(); }}
                color='cyan'
            />
        </Box>
    );
};

function getPinnedMismatchItems(
    mismatch: PinnedVersionMismatch,
    canRunPackageManager: boolean
): ListEntry<PinnedVersionMismatchAction>[] {
    const items: ListEntry<PinnedVersionMismatchAction>[] = [];

    if (mismatch.canUpdateToRunningVersion) {
        items.push({
            label: `Update ${mismatch.packageManager} global install to v${mismatch.runningVersion}`,
            value: 'update',
            disabled: !canRunPackageManager,
            sublabel: canRunPackageManager ? undefined : `(${mismatch.packageManager} not installed)`,
            description: `Runs ${mismatch.packageManager === 'npm'
                ? `npm install -g ccstatusline@${mismatch.runningVersion}`
                : `bun add -g ccstatusline@${mismatch.runningVersion}`}`
        });
    }

    items.push({
        label: 'Exit',
        value: 'exit',
        description: `Relaunch manually with ${mismatch.relaunchCommand}`
    });

    return items;
}

const PinnedVersionMismatchScreen: React.FC<PinnedVersionMismatchScreenProps> = ({
    mismatch,
    canRunPackageManager,
    onUpdate,
    onExit
}) => {
    useInput((_, key) => {
        if (key.escape) {
            onExit();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Pinned Install Version Mismatch</Text>
            <Box marginTop={1} flexDirection='column'>
                <Text color='yellow'>
                    Claude Code is pinned to ccstatusline v
                    {mismatch.installedVersion}
                    , but this TUI is v
                    {mismatch.runningVersion}
                    .
                </Text>
                <Text dimColor wrap='wrap'>
                    To avoid writing config that the pinned runtime may not support,
                    update the pinned global install or exit and relaunch the pinned version.
                </Text>
            </Box>
            <Box marginTop={1} flexDirection='column'>
                <Text>
                    Current pinned version:
                    {' '}
                    {mismatch.relaunchCommand}
                </Text>
            </Box>
            <List
                marginTop={1}
                items={getPinnedMismatchItems(mismatch, canRunPackageManager)}
                onSelect={(value) => {
                    if (value === 'back') {
                        return;
                    }

                    if (value === 'update') {
                        onUpdate();
                        return;
                    }

                    onExit();
                }}
                color='cyan'
            />
        </Box>
    );
};

function getGlobalUninstallCommand(packageManager: GlobalPackageManager): string {
    return packageManager === 'npm'
        ? 'npm uninstall -g ccstatusline'
        : 'bun remove -g ccstatusline';
}

function buildUninstallConfirmMessage(selection: UninstallSelection): string {
    if (selection.packageManagers.length === 0) {
        return `This will remove ccstatusline from ${getClaudeSettingsPath()}. Continue?`;
    }

    const commands = selection.packageManagers
        .map(packageManager => getGlobalUninstallCommand(packageManager))
        .join('\n');

    return `This will remove ccstatusline from ${getClaudeSettingsPath()} and run:\n\n${commands}\n\nContinue?`;
}

function clearInstallationMetadata(settings: Settings | null): Settings | null {
    if (!settings) {
        return settings;
    }

    const { installation, ...next } = settings;
    void installation;
    return next;
}

export function getCurrentInstallation(
    isClaudeInstalled: boolean,
    existingStatusLine: string | null,
    settings: Settings
): InstallationMetadata {
    return isClaudeInstalled && !existingStatusLine && settings.installation
        ? settings.installation
        : classifyInstallation(existingStatusLine, settings.installation);
}

function trimTrailingSeparators(filePath: string): string {
    return filePath.replace(/[\\/]+$/, '');
}

function joinCommandPath(dir: string, command: string): string {
    const separator = dir.includes('\\') && !dir.includes('/')
        ? '\\'
        : '/';

    return `${trimTrailingSeparators(dir)}${separator}${command}`;
}

function getCommandFileName(globalBinDir: string, platform: NodeJS.Platform): string {
    if (platform === 'win32' || /^[a-z]:[\\/]/i.test(globalBinDir)) {
        return 'ccstatusline.cmd';
    }

    return 'ccstatusline';
}

function getPinnedGlobalRelaunchCommand(packageManager: GlobalPackageManager): string {
    const resolution = inspectGlobalCommandResolution(packageManager);

    if (
        resolution.firstResolvedPath
        && (!resolution.expectedBinDir || isPathInsideDir(resolution.firstResolvedPath, resolution.expectedBinDir))
    ) {
        return resolution.firstResolvedPath;
    }

    if (resolution.expectedBinDir) {
        return joinCommandPath(
            resolution.expectedBinDir,
            getCommandFileName(resolution.expectedBinDir, process.platform)
        );
    }

    return 'ccstatusline';
}

export function getPinnedVersionMismatch(
    installation: ResolvedInstallationMetadata,
    runningVersion: string,
    relaunchCommand: string
): PinnedVersionMismatch | null {
    if (
        installation.method !== 'pinned'
        || !installation.installedVersion
        || installation.packageManager === 'unknown'
        || !runningVersion
        || installation.installedVersion === runningVersion
    ) {
        return null;
    }

    return {
        packageManager: installation.packageManager,
        installedVersion: installation.installedVersion,
        runningVersion,
        relaunchCommand,
        canUpdateToRunningVersion: compareVersions(runningVersion, installation.installedVersion) > 0
    };
}

export function getPathInferredInstallation(
    installation: InstallationMetadata,
    activeCommand: ActiveGlobalCommandResolution | null
): ResolvedInstallationMetadata {
    if (installation.method === 'pinned') {
        return {
            ...installation,
            packageManager: activeCommand?.packageManager ?? 'unknown',
            installedVersion: activeCommand?.version ?? installation.installedVersion
        };
    }

    if (
        activeCommand
        && activeCommand.packageManager !== 'unknown'
        && installation.method === 'self-managed'
    ) {
        return {
            ...installation,
            packageManager: activeCommand.packageManager
        };
    }

    return installation;
}

export function getConfirmCancelScreen(confirmDialog: ConfirmDialogState | null): Exclude<AppScreen, 'confirm'> {
    return confirmDialog?.cancelScreen ?? 'main';
}

export function clearInstallMenuSelection(menuSelections: Record<string, number>): Record<string, number> {
    if (menuSelections.install === undefined && menuSelections.installPackage === undefined) {
        return menuSelections;
    }

    const next = { ...menuSelections };
    delete next.install;
    delete next.installPackage;
    return next;
}

export const App: React.FC = () => {
    const { exit } = useApp();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [screen, setScreen] = useState<AppScreen>('main');
    const [selectedLine, setSelectedLine] = useState(0);
    const [menuSelections, setMenuSelections] = useState<Record<string, number>>({});
    const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
    const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);
    const [powerlineFontStatus, setPowerlineFontStatus] = useState<PowerlineFontStatus>({ installed: false });
    const [installingFonts, setInstallingFonts] = useState(false);
    const [fontInstallMessage, setFontInstallMessage] = useState<string | null>(null);
    const [existingStatusLine, setExistingStatusLine] = useState<string | null>(null);
    const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);
    const [previewIsTruncated, setPreviewIsTruncated] = useState(false);
    const [currentRefreshInterval, setCurrentRefreshInterval] = useState<number | null>(null);
    const [supportsRefreshInterval] = useState(() => isClaudeCodeVersionAtLeast('2.1.97'));
    const [commandAvailability] = useState(() => getPackageCommandAvailability());
    const [updateCheckerState, setUpdateCheckerState] = useState<UpdateCheckerState>({ status: 'checking' });
    const [flowNotice, setFlowNotice] = useState<FlowNoticeState | null>(null);
    const [globalPackageInstallations, setGlobalPackageInstallations] = useState<GlobalPackageInstallation[]>([]);
    const [updatesReturnScreen, setUpdatesReturnScreen] = useState<'main' | 'manageInstallation'>('main');
    const [hasLoadedClaudeStatus, setHasLoadedClaudeStatus] = useState(false);
    const [hasLoadedInstalledState, setHasLoadedInstalledState] = useState(false);

    useEffect(() => {
        void loadClaudeStatusLineState()
            .then((statusLineState) => {
                setExistingStatusLine(statusLineState.existingStatusLine);
                setCurrentRefreshInterval(statusLineState.refreshInterval);
            })
            .catch(() => {
                setExistingStatusLine(null);
                setCurrentRefreshInterval(null);
            })
            .finally(() => {
                setHasLoadedClaudeStatus(true);
            });
        void loadSettings().then((loadedSettings) => {
            // Set global chalk level based on settings (default to 256 colors for compatibility)
            chalk.level = loadedSettings.colorLevel;
            setSettings(loadedSettings);
            setOriginalSettings(cloneSettings(loadedSettings));
        });
        void isInstalled()
            .then(setIsClaudeInstalled)
            .catch(() => { setIsClaudeInstalled(false); })
            .finally(() => {
                setHasLoadedInstalledState(true);
            });

        // Check for Powerline fonts on startup (use sync version that doesn't call execSync)
        const fontStatus = checkPowerlineFonts();
        setPowerlineFontStatus(fontStatus);

        // Optionally do the async check later (but not blocking React)
        void checkPowerlineFontsAsync().then((asyncStatus) => {
            setPowerlineFontStatus(asyncStatus);
        });

        const handleResize = () => {
            setTerminalWidth(process.stdout.columns || 80);
        };

        process.stdout.on('resize', handleResize);
        return () => {
            process.stdout.off('resize', handleResize);
        };
    }, []);

    // Check for changes whenever settings update
    useEffect(() => {
        if (originalSettings) {
            const hasAnyChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);
            setHasChanges(hasAnyChanges);
        }
    }, [settings, originalSettings]);

    // Clear header message after 2 seconds
    useEffect(() => {
        if (flashMessage) {
            const timer = setTimeout(() => {
                setFlashMessage(null);
            }, 2000);
            return () => { clearTimeout(timer); };
        }
    }, [flashMessage]);

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            exit();
        }
        // Global save shortcut
        if (key.ctrl && input === 's' && settings) {
            const installation = getCurrentInstallation(isClaudeInstalled, existingStatusLine, settings);
            const activeCommand = installation.method === 'pinned' || installation.method === 'self-managed'
                ? inspectActiveGlobalCommand({ commandAvailability })
                : null;
            const effectiveInstallation = getPathInferredInstallation(installation, activeCommand);
            const mismatch = getPinnedVersionMismatch(effectiveInstallation, getPackageVersion(), 'ccstatusline');
            if (mismatch) {
                return;
            }

            void (async () => {
                await saveSettings(settings);
                setOriginalSettings(cloneSettings(settings));
                setHasChanges(false);
                setFlashMessage({
                    text: '✓ Configuration saved',
                    color: 'green'
                });
            })();
        }
    });

    const getGlobalResolutionWarning = useCallback((packageManager: 'npm' | 'bun') => (
        inspectGlobalCommandResolution(packageManager).warning
    ), []);

    const handleInstallSelection = useCallback((selection: InstallSelection) => {
        void getExistingStatusLine().then((existing) => {
            const isAlreadyInstalled = isKnownCommand(existing ?? '');
            const finalCommand = buildStatusLineCommand(selection.commandMode);
            const hookCommand = `${finalCommand} --hook`;
            const sideEffects = [
                `Claude settings path: ${getClaudeSettingsPath()}`,
                ...(selection.globalInstallCommand
                    ? [`Global install command before settings write: ${selection.globalInstallCommand}`]
                    : []),
                `Final statusLine.command: ${finalCommand}`,
                `Hook command behavior: hook-enabled widgets run ${hookCommand}`
            ];
            let message = sideEffects.join('\n');

            if (existing && !isAlreadyInstalled) {
                message = `A status line is already configured: "${existing}"\n\n${message}\n\nReplace it?`;
            } else if (isAlreadyInstalled) {
                message = `ccstatusline is already installed.\n\n${message}\n\nUpdate it?`;
            } else {
                message = `${message}\n\nContinue?`;
            }

            setConfirmDialog({
                message,
                cancelScreen: 'install',
                action: async () => {
                    try {
                        if (selection.globalInstallCommand) {
                            await runGlobalPackageInstall(selection.packageManager, getPackageVersion());
                        }

                        await installStatusLine({
                            commandMode: selection.commandMode,
                            supportsRefreshInterval,
                            installationMetadata: selection.metadata
                        });

                        const installedStatusLineState = await loadClaudeStatusLineState();
                        setIsClaudeInstalled(true);
                        setExistingStatusLine(installedStatusLineState.existingStatusLine ?? finalCommand);
                        setCurrentRefreshInterval(installedStatusLineState.refreshInterval);
                        setSettings(prev => prev
                            ? { ...prev, installation: selection.metadata }
                            : prev);
                        setOriginalSettings(prev => prev
                            ? { ...prev, installation: selection.metadata }
                            : prev);
                        setMenuSelections(prev => ({
                            ...prev,
                            main: getMainMenuInstallSelectionIndex(true, selection.metadata)
                        }));
                        const resolutionWarning = selection.globalInstallCommand
                            ? getGlobalResolutionWarning(selection.packageManager)
                            : null;

                        if (resolutionWarning) {
                            setFlashMessage(null);
                            setFlowNotice({
                                title: 'Install Complete',
                                message: `Installed to Claude Code.\n\n${resolutionWarning}`,
                                color: 'yellow',
                                continueScreen: 'main'
                            });
                            setScreen('flowNotice');
                        } else {
                            setScreen('main');
                            setFlashMessage({
                                text: '✓ Installed to Claude Code',
                                color: 'green'
                            });
                        }
                    } catch {
                        setFlashMessage({
                            text: '✗ Install failed',
                            color: 'red'
                        });
                        setScreen('install');
                    }
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        });
    }, [getGlobalResolutionWarning, supportsRefreshInterval]);

    const handleInstallMenuCancel = useCallback(() => {
        setMenuSelections(clearInstallMenuSelection);
        setScreen('main');
    }, []);

    const handleWidgetHighlight = useCallback((widgetId: string | null) => {
        setActiveWidgetId(widgetId);
    }, []);

    const isThemeManaged = settings?.powerline.enabled
        && settings.powerline.theme
        && settings.powerline.theme !== 'custom';

    const handleTabSwap = useCallback(() => {
        setScreen(prev => (prev === 'items' ? 'colors' : 'items'));
    }, []);

    const handleUpdateCheck = useCallback(() => {
        setUpdateCheckerState({ status: 'checking' });
        const installation = settings
            ? getCurrentInstallation(isClaudeInstalled, existingStatusLine, settings)
            : classifyInstallation(existingStatusLine, undefined);
        const activeCommand = installation.method === 'pinned' || installation.method === 'self-managed'
            ? inspectActiveGlobalCommand({ commandAvailability })
            : null;
        const effectiveUpdateInstallation = getPathInferredInstallation(installation, activeCommand);
        const currentUpdateVersion = effectiveUpdateInstallation.method === 'pinned' && effectiveUpdateInstallation.installedVersion
            ? effectiveUpdateInstallation.installedVersion
            : getPackageVersion();

        void checkForUpdates({
            currentVersion: currentUpdateVersion,
            installedCommand: existingStatusLine,
            installationMetadata: effectiveUpdateInstallation,
            commandAvailability
        }).then(setUpdateCheckerState);
    }, [commandAvailability, existingStatusLine, isClaudeInstalled, settings]);

    const handleRunUpdateAction = useCallback((action: UpdateAction) => {
        setConfirmDialog({
            message: `Run global update command?\n\n${action.command}\n\nClaude settings will not be changed.`,
            cancelScreen: 'updates',
            action: async () => {
                try {
                    await runGlobalUpdateAction(action);
                    const installation = {
                        method: 'pinned' as const,
                        installedVersion: action.version
                    };

                    await saveInstallationMetadata(installation);
                    setSettings(prev => prev
                        ? { ...prev, installation }
                        : prev);
                    setOriginalSettings(prev => prev
                        ? { ...prev, installation }
                        : prev);
                    const resolutionWarning = getGlobalResolutionWarning(action.packageManager);

                    if (resolutionWarning) {
                        setFlashMessage(null);
                        setFlowNotice({
                            title: 'Update Complete',
                            message: `Global package updated.\n\n${resolutionWarning}`,
                            color: 'yellow',
                            continueScreen: 'updates'
                        });
                        setScreen('flowNotice');
                    } else {
                        setFlashMessage({
                            text: '✓ Global package updated',
                            color: 'green'
                        });
                        setScreen('updates');
                    }
                } catch {
                    setFlashMessage({
                        text: '✗ Global update failed',
                        color: 'red'
                    });
                    setScreen('updates');
                }

                setConfirmDialog(null);
            }
        });
        setScreen('confirm');
    }, [getGlobalResolutionWarning]);

    if (!settings || !hasLoadedClaudeStatus || !hasLoadedInstalledState) {
        return <Text>Loading settings...</Text>;
    }

    const runningVersion = getPackageVersion();
    const currentInstallation = getCurrentInstallation(isClaudeInstalled, existingStatusLine, settings);
    const activeGlobalCommand = currentInstallation.method === 'pinned' || currentInstallation.method === 'self-managed'
        ? inspectActiveGlobalCommand({ commandAvailability })
        : null;
    const effectiveInstallation = getPathInferredInstallation(currentInstallation, activeGlobalCommand);
    const pinnedVersionMismatch = effectiveInstallation.method === 'pinned'
        && effectiveInstallation.packageManager !== 'unknown'
        ? getPinnedVersionMismatch(
            effectiveInstallation,
            runningVersion,
            getPinnedGlobalRelaunchCommand(effectiveInstallation.packageManager)
        )
        : null;

    const handlePinnedVersionMismatchUpdate = async (mismatch: PinnedVersionMismatch) => {
        try {
            await runGlobalPackageInstall(mismatch.packageManager, mismatch.runningVersion);
            const installation = {
                method: 'pinned' as const,
                installedVersion: mismatch.runningVersion
            };

            await saveInstallationMetadata(installation);
            setSettings(prev => prev
                ? { ...prev, installation }
                : prev);
            setOriginalSettings(prev => prev
                ? { ...prev, installation }
                : prev);

            const resolutionWarning = getGlobalResolutionWarning(mismatch.packageManager);
            if (resolutionWarning) {
                setFlashMessage(null);
                setFlowNotice({
                    title: 'Update Complete',
                    message: `Global package updated.\n\n${resolutionWarning}`,
                    color: 'yellow',
                    continueScreen: 'main'
                });
                setScreen('flowNotice');
            } else {
                setFlashMessage({
                    text: '✓ Global package updated',
                    color: 'green'
                });
                setScreen('main');
            }
        } catch {
            setFlashMessage({
                text: '✗ Global update failed',
                color: 'red'
            });
        }
    };

    const handleUninstallSelection = (selection: UninstallSelection, cancelScreen: Exclude<AppScreen, 'confirm'>) => {
        setConfirmDialog({
            message: buildUninstallConfirmMessage(selection),
            cancelScreen,
            action: async () => {
                let removedClaudeSettings = false;

                try {
                    await uninstallStatusLine();
                    removedClaudeSettings = true;

                    for (const packageManager of selection.packageManagers) {
                        await runGlobalPackageUninstall(packageManager);
                    }

                    setIsClaudeInstalled(false);
                    setExistingStatusLine(null);
                    setCurrentRefreshInterval(null);
                    setSettings(clearInstallationMetadata);
                    setOriginalSettings(clearInstallationMetadata);
                    setMenuSelections(prev => ({
                        ...prev,
                        main: getMainMenuInstallSelectionIndex(false)
                    }));
                    setFlashMessage({
                        text: selection.packageManagers.length > 0
                            ? '✓ Uninstalled from Claude Code and removed global package'
                            : '✓ Uninstalled from Claude Code',
                        color: 'green'
                    });
                    setScreen('main');
                } catch {
                    if (removedClaudeSettings) {
                        setIsClaudeInstalled(false);
                        setExistingStatusLine(null);
                        setCurrentRefreshInterval(null);
                        setSettings(clearInstallationMetadata);
                        setOriginalSettings(clearInstallationMetadata);
                        setMenuSelections(prev => ({
                            ...prev,
                            main: getMainMenuInstallSelectionIndex(false)
                        }));
                        setFlashMessage({
                            text: '✗ Removed Claude settings, but global package removal failed',
                            color: 'red'
                        });
                        setScreen('main');
                    } else {
                        setFlashMessage({
                            text: '✗ Uninstall failed',
                            color: 'red'
                        });
                        setScreen(cancelScreen);
                    }
                }

                setConfirmDialog(null);
            }
        });
        setScreen('confirm');
    };

    const handleInstallUninstall = () => {
        if (isClaudeInstalled) {
            handleUninstallSelection({ packageManagers: [] }, 'main');
        } else {
            setScreen('install');
        }
    };

    const handleManageInstallationSelect = (action: 'checkUpdates' | 'uninstall') => {
        if (action === 'checkUpdates') {
            setUpdatesReturnScreen('manageInstallation');
            setScreen('updates');
            handleUpdateCheck();
            return;
        }

        setGlobalPackageInstallations(inspectGlobalPackageInstallations({ commandAvailability }));
        setScreen('uninstallOptions');
    };

    const handleMainMenuSelect = async (value: MainMenuOption) => {
        switch (value) {
            case 'lines':
                setScreen('lines');
                break;
            case 'colors':
                setScreen('colorLines');
                break;
            case 'terminalConfig':
                setScreen('terminalConfig');
                break;
            case 'globalOverrides':
                setScreen('globalOverrides');
                break;
            case 'powerline':
                setScreen('powerline');
                break;
            case 'install':
                handleInstallUninstall();
                break;
            case 'manageInstallation':
                setScreen('manageInstallation');
                break;
            case 'checkUpdates':
                setUpdatesReturnScreen('main');
                setScreen('updates');
                handleUpdateCheck();
                break;
            case 'configureStatusLine':
                setScreen('refreshInterval');
                break;
            case 'starGithub':
                setConfirmDialog({
                    message: `Open the ccstatusline GitHub repository in your browser?\n\n${GITHUB_REPO_URL}`,
                    action: () => {
                        const result = openExternalUrl(GITHUB_REPO_URL);
                        if (result.success) {
                            setFlashMessage({
                                text: '✓ Opened GitHub repository in browser',
                                color: 'green'
                            });
                        } else {
                            setFlashMessage({
                                text: `✗ Could not open browser. Visit: ${GITHUB_REPO_URL}`,
                                color: 'red'
                            });
                        }
                        setScreen('main');
                        setConfirmDialog(null);
                        return Promise.resolve();
                    }
                });
                setScreen('confirm');
                break;
            case 'save':
                await saveSettings(settings);
                setOriginalSettings(cloneSettings(settings)); // Update original after save
                setHasChanges(false);
                exit();
                break;
            case 'exit':
                exit();
                break;
        }
    };

    if (pinnedVersionMismatch) {
        return (
            <Box flexDirection='column'>
                <Box marginBottom={1}>
                    <Text bold>
                        <Gradient name='retro'>
                            CCStatusline Configuration
                        </Gradient>
                    </Text>
                    <Text bold>
                        {` | ${runningVersion && `v${runningVersion}`}`}
                    </Text>
                    {flashMessage && (
                        <Text color={flashMessage.color} bold>
                            {`  ${flashMessage.text}`}
                        </Text>
                    )}
                </Box>
                <PinnedVersionMismatchScreen
                    mismatch={pinnedVersionMismatch}
                    canRunPackageManager={commandAvailability[pinnedVersionMismatch.packageManager]}
                    onUpdate={() => {
                        void handlePinnedVersionMismatchUpdate(pinnedVersionMismatch);
                    }}
                    onExit={exit}
                />
            </Box>
        );
    }

    const updateLine = (lineIndex: number, widgets: WidgetItem[]) => {
        const newLines = [...settings.lines];
        newLines[lineIndex] = widgets;
        setSettings({ ...settings, lines: newLines });
    };

    const updateLines = (newLines: WidgetItem[][]) => {
        setSettings({ ...settings, lines: newLines });
    };

    const handleLineSelect = (lineIndex: number) => {
        setSelectedLine(lineIndex);
        setScreen('items');
    };

    return (
        <Box flexDirection='column'>
            <Box marginBottom={1}>
                <Text bold>
                    <Gradient name='retro'>
                        CCStatusline Configuration
                    </Gradient>
                </Text>
                <Text bold>
                    {` | ${runningVersion && `v${runningVersion}`}`}
                </Text>
                {flashMessage && (
                    <Text color={flashMessage.color} bold>
                        {`  ${flashMessage.text}`}
                    </Text>
                )}
            </Box>
            {isCustomConfigPath() && (
                <Text dimColor>{`Config: ${getConfigPath()}`}</Text>
            )}

            <StatusLinePreview
                lines={settings.lines}
                terminalWidth={terminalWidth}
                settings={settings}
                onTruncationChange={setPreviewIsTruncated}
            />

            <Box marginTop={1}>
                {screen === 'main' && (
                    <MainMenu
                        onSelect={(value, index) => {
                            // Only persist menu selection if not exiting
                            if (value !== 'save' && value !== 'exit') {
                                setMenuSelections(prev => ({ ...prev, main: index }));
                            }

                            void handleMainMenuSelect(value);
                        }}
                        isClaudeInstalled={isClaudeInstalled}
                        hasChanges={hasChanges}
                        initialSelection={menuSelections.main}
                        powerlineFontStatus={powerlineFontStatus}
                        settings={settings}
                        installation={effectiveInstallation}
                        previewIsTruncated={previewIsTruncated}
                    />
                )}
                {screen === 'lines' && (
                    <LineSelector
                        lines={settings.lines}
                        onSelect={(line) => {
                            setMenuSelections(prev => ({ ...prev, lines: line }));
                            handleLineSelect(line);
                        }}
                        onLinesUpdate={updateLines}
                        onBack={() => {
                            // Save that we came from 'lines' menu (index 0)
                            // Clear the line selection so it resets next time we enter
                            setMenuSelections(prev => ({ ...prev, main: 0 }));
                            setScreen('main');
                        }}
                        initialSelection={menuSelections.lines}
                        title='Select Line to Edit Items'
                        allowEditing={true}
                    />
                )}
                {screen === 'items' && (
                    <ItemsEditor
                        widgets={settings.lines[selectedLine] ?? []}
                        onUpdate={(widgets) => { updateLine(selectedLine, widgets); }}
                        onBack={() => {
                            // When going back to lines menu, preserve which line was selected
                            setMenuSelections(prev => ({ ...prev, lines: selectedLine }));
                            setScreen('lines');
                        }}
                        lineNumber={selectedLine + 1}
                        settings={settings}
                        onTabSwap={isThemeManaged ? undefined : handleTabSwap}
                        onWidgetHighlight={handleWidgetHighlight}
                        initialWidgetId={activeWidgetId}
                    />
                )}
                {screen === 'colorLines' && (
                    <LineSelector
                        lines={settings.lines}
                        onLinesUpdate={updateLines}
                        onSelect={(line) => {
                            setMenuSelections(prev => ({ ...prev, lines: line }));
                            setSelectedLine(line);
                            setScreen('colors');
                        }}
                        onBack={() => {
                            // Save that we came from 'colors' menu (index 1)
                            setMenuSelections(prev => ({ ...prev, main: 1 }));
                            setScreen('main');
                        }}
                        initialSelection={menuSelections.lines}
                        title='Select Line to Edit Colors'
                        blockIfPowerlineActive={true}
                        settings={settings}
                        allowEditing={false}
                    />
                )}
                {screen === 'colors' && (
                    <ColorMenu
                        widgets={settings.lines[selectedLine] ?? []}
                        lineIndex={selectedLine}
                        settings={settings}
                        onUpdate={(updatedWidgets) => {
                            // Update only the selected line
                            const newLines = [...settings.lines];
                            newLines[selectedLine] = updatedWidgets;
                            setSettings({ ...settings, lines: newLines });
                        }}
                        onBack={() => {
                            // Go back to line selection for colors
                            setScreen('colorLines');
                        }}
                        onTabSwap={isThemeManaged ? undefined : handleTabSwap}
                        onWidgetHighlight={handleWidgetHighlight}
                        initialWidgetId={activeWidgetId}
                    />
                )}
                {screen === 'terminalConfig' && (
                    <TerminalOptionsMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={(target?: string) => {
                            if (target === 'width') {
                                setScreen('terminalWidth');
                            } else {
                                // Save that we came from 'terminalConfig' menu (index 3)
                                setMenuSelections(prev => ({ ...prev, main: 3 }));
                                setScreen('main');
                            }
                        }}
                    />
                )}
                {screen === 'terminalWidth' && (
                    <TerminalWidthMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            setScreen('terminalConfig');
                        }}
                    />
                )}
                {screen === 'globalOverrides' && (
                    <GlobalOverridesMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            // Save that we came from 'globalOverrides' menu (index 4)
                            setMenuSelections(prev => ({ ...prev, main: 4 }));
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'confirm' && confirmDialog && (
                    <ConfirmDialog
                        message={confirmDialog.message}
                        onConfirm={() => void confirmDialog.action()}
                        onCancel={() => {
                            setScreen(getConfirmCancelScreen(confirmDialog));
                            setConfirmDialog(null);
                        }}
                    />
                )}
                {screen === 'flowNotice' && flowNotice && (
                    <FlowNotice
                        {...flowNotice}
                        onContinue={() => {
                            setScreen(flowNotice.continueScreen);
                            setFlowNotice(null);
                        }}
                    />
                )}
                {screen === 'install' && (
                    <InstallMenu
                        commandAvailability={commandAvailability}
                        currentVersion={getPackageVersion()}
                        existingStatusLine={existingStatusLine}
                        onSelect={(selection) => {
                            setMenuSelections(prev => ({
                                ...prev,
                                installPackage: selection.packageManager === 'bun' ? 1 : 0
                            }));
                            handleInstallSelection(selection);
                        }}
                        onCancel={handleInstallMenuCancel}
                        initialPackageSelection={menuSelections.installPackage}
                    />
                )}
                {screen === 'manageInstallation' && (
                    <ManageInstallationMenu
                        installation={effectiveInstallation}
                        activeCommand={activeGlobalCommand}
                        onSelect={handleManageInstallationSelect}
                        onBack={() => {
                            setMenuSelections(prev => ({
                                ...prev,
                                main: getMainMenuInstallSelectionIndex(true, effectiveInstallation)
                            }));
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'uninstallOptions' && (
                    <UninstallMenu
                        installations={globalPackageInstallations}
                        onSelect={(selection) => {
                            handleUninstallSelection(selection, 'uninstallOptions');
                        }}
                        onBack={() => {
                            setScreen('manageInstallation');
                        }}
                    />
                )}
                {screen === 'updates' && (
                    <UpdateCheckerMenu
                        state={updateCheckerState}
                        onBack={() => {
                            setScreen(updatesReturnScreen);
                        }}
                        onRefresh={handleUpdateCheck}
                        onRunAction={handleRunUpdateAction}
                    />
                )}
                {screen === 'refreshInterval' && (
                    <RefreshIntervalMenu
                        currentInterval={currentRefreshInterval}
                        supportsRefreshInterval={supportsRefreshInterval}
                        gitCacheTtlSeconds={settings.gitCacheTtlSeconds}
                        onUpdate={(interval) => {
                            const previous = currentRefreshInterval;
                            setCurrentRefreshInterval(interval);
                            void setRefreshInterval(interval)
                                .then(() => {
                                    setFlashMessage({
                                        text: '✓ Refresh interval updated',
                                        color: 'green'
                                    });
                                })
                                .catch(() => {
                                    setCurrentRefreshInterval(previous);
                                    setFlashMessage({
                                        text: '✗ Failed to save refresh interval',
                                        color: 'red'
                                    });
                                });
                            setScreen('main');
                        }}
                        onGitCacheTtlUpdate={(ttlSeconds) => {
                            setSettings({
                                ...settings,
                                gitCacheTtlSeconds: ttlSeconds
                            });
                            setFlashMessage({
                                text: '✓ Git cache TTL updated',
                                color: 'green'
                            });
                            setScreen('main');
                        }}
                        onBack={() => {
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'powerline' && (
                    <PowerlineSetup
                        settings={settings}
                        powerlineFontStatus={powerlineFontStatus}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={() => {
                            setScreen('main');
                        }}
                        onInstallFonts={() => {
                            setInstallingFonts(true);
                            // Add a small delay to allow React to render the "Installing..." message
                            // before the blocking execSync calls in installPowerlineFonts
                            setTimeout(() => {
                                void installPowerlineFonts().then((result) => {
                                    setInstallingFonts(false);
                                    setFontInstallMessage(result.message);
                                    // Refresh font status
                                    void checkPowerlineFontsAsync().then((asyncStatus) => {
                                        setPowerlineFontStatus(asyncStatus);
                                    });
                                });
                            }, 50);
                        }}
                        installingFonts={installingFonts}
                        fontInstallMessage={fontInstallMessage}
                        onClearMessage={() => { setFontInstallMessage(null); }}
                    />
                )}
            </Box>
        </Box>
    );
};

export function runTUI() {
    // Clear the terminal before starting the TUI
    process.stdout.write('\x1b[2J\x1b[H');
    render(<App />);
}
