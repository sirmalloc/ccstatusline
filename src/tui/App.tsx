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
    useMemo,
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
    applyImport,
    exportConfig,
    getConfigLoadError,
    getConfigPath,
    isCustomConfigPath,
    loadSettings,
    saveInstallationMetadata,
    saveSettings,
    validateImportFile,
    type ImportValidationResult
} from '../utils/config';
import {
    EMPTY_THEME_SLOT_CONTEXT,
    buildThemeSlotContexts
} from '../utils/effective-theme-colors';
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
import { preRenderAllWidgets } from '../utils/renderer';
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
    ColorEditingMovedNotice,
    ColorMenu,
    ConfirmDialog,
    ExportConfigDialog,
    GlobalOverridesMenu,
    ImportConfigDialog,
    ImportPreviewDialog,
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
    | 'colors'
    | 'colorsMoved'
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
    | 'refreshInterval'
    | 'exportConfig'
    | 'importConfig'
    | 'importPreview';

type PinnedVersionMismatchAction = 'update' | 'exit';

export interface ConfirmDialogState {
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

/**
 * Screen a main menu option navigates to directly, or null when the option
 * needs a handler of its own (dialogs, installs, exiting).
 */
export function getMainMenuScreenTarget(value: MainMenuOption): AppScreen | null {
    switch (value) {
        case 'lines':
            return 'lines';
        case 'colors':
            // Color editing now lives in the widget editor; this entry only signposts it.
            return 'colorsMoved';
        case 'powerline':
            return 'powerline';
        case 'terminalConfig':
            return 'terminalConfig';
        case 'globalOverrides':
            return 'globalOverrides';
        case 'manageInstallation':
            return 'manageInstallation';
        case 'configureStatusLine':
            return 'refreshInterval';
        case 'exportConfig':
            return 'exportConfig';
        case 'importConfig':
            return 'importConfig';
        // These run an action rather than opening a screen, so the caller handles them.
        case 'install':
        case 'checkUpdates':
        case 'starGithub':
        case 'save':
        case 'exit':
            return null;
        default: {
            // A new MainMenuOption must be classified here rather than silently doing nothing.
            const exhaustive: never = value;
            void exhaustive;
            return null;
        }
    }
}

/**
 * Both widget editor modes back out one menu to the same line selector, so
 * escape lands in the same place whichever mode you happened to be in.
 */
export const EDITOR_BACK_SCREEN: AppScreen = 'lines';

/** Tab swaps between editing a line's widgets and editing their colors. */
export function getTabSwapScreen(screen: AppScreen): AppScreen {
    if (screen === 'items') {
        return 'colors';
    }

    if (screen === 'colors') {
        return 'items';
    }

    return screen;
}

export function applyTuiImport(
    current: Settings,
    imported: Settings,
    mode: 'replace' | 'merge',
    presentKeys: readonly (keyof Settings)[]
): Settings {
    const nextSettings = applyImport(current, imported, mode, presentKeys);
    chalk.level = nextSettings.colorLevel;
    return nextSettings;
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

export function buildConfigLoadWarning(configLoadError: string | null): string | null {
    if (!configLoadError) {
        return null;
    }

    return `⚠ ${configLoadError} — showing defaults; saving here overwrites the file.`;
}

export function buildInvalidConfigSaveConfirm(
    configLoadError: string | null,
    onConfirm: () => void
): ConfirmDialogState | null {
    if (!configLoadError) {
        return null;
    }

    return {
        message: `${configLoadError} and is preserved on disk. Saving replaces it with the current configuration. Continue?`,
        action: () => {
            onConfirm();
            return Promise.resolve();
        },
        cancelScreen: 'main'
    };
}

export const App: React.FC = () => {
    const { exit } = useApp();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [configLoadError, setConfigLoadError] = useState<string | null>(null);
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
    const [importValidation, setImportValidation] = useState<ImportValidationResult | null>(null);
    // Colour-editor mode lives here so it survives the Tab swap, which changes screen and
    // therefore unmounts the editor.
    const [colorEditingBackground, setColorEditingBackground] = useState(false);
    const [colorShowSeparators, setColorShowSeparators] = useState(false);

    // Pre-render every line once per settings change. The preview needs the output, and so
    // do the editors: which theme color a widget wears depends on which widgets before it
    // actually render, so an editor guessing at that would preview colors the status line
    // never uses. Pre-rendering runs custom commands, so it must happen exactly once.
    const preRenderedLines = useMemo(() => {
        if (!settings) {
            return [];
        }

        return preRenderAllWidgets(settings.lines, settings, {
            terminalWidth,
            isPreview: true,
            minimalist: settings.minimalistMode,
            gitCacheTtlSeconds: settings.gitCacheTtlSeconds
        });
    }, [settings, terminalWidth]);

    const themeSlotContexts = useMemo(
        () => buildThemeSlotContexts(
            preRenderedLines,
            Boolean(settings?.powerline.enabled && settings.powerline.continueThemeAcrossLines)
        ),
        [preRenderedLines, settings]
    );

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
            // Capture why settings.json was rejected (if at all) so the TUI can warn and
            // guard saves. Read it here, in the load callback: the module-scoped signal is
            // reset by any later loadSettings/saveInstallationMetadata call.
            setConfigLoadError(getConfigLoadError());
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
        if (key.ctrl && input === 's' && settings && screen !== 'confirm') {
            const installation = getCurrentInstallation(isClaudeInstalled, existingStatusLine, settings);
            const activeCommand = installation.method === 'pinned' || installation.method === 'self-managed'
                ? inspectActiveGlobalCommand({ commandAvailability })
                : null;
            const effectiveInstallation = getPathInferredInstallation(installation, activeCommand);
            const mismatch = getPinnedVersionMismatch(effectiveInstallation, getPackageVersion(), 'ccstatusline');
            if (mismatch) {
                return;
            }

            const performSave = () => {
                void (async () => {
                    try {
                        await saveSettings(settings);
                        setOriginalSettings(cloneSettings(settings));
                        setHasChanges(false);
                        // File is valid again after an explicit save → clear the banner + guard.
                        setConfigLoadError(null);
                        setFlashMessage({
                            text: '✓ Configuration saved',
                            color: 'green'
                        });
                    } catch {
                        setFlashMessage({
                            text: '✗ Could not save configuration',
                            color: 'red'
                        });
                    }
                })();
            };

            const saveGuard = buildInvalidConfigSaveConfirm(configLoadError, () => {
                // The confirm dialog doesn't self-dismiss; its action must navigate away
                // (matching the other confirm flows in this file). Return to the main menu
                // before saving so the success flash isn't hidden behind the dialog.
                setConfirmDialog(null);
                setScreen('main');
                performSave();
            });
            if (saveGuard) {
                setConfirmDialog(saveGuard);
                setScreen('confirm');
            } else {
                performSave();
            }
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

                        // Install re-ran loadSettings internally — re-sync the captured
                        // config-load error so the banner/guard reflect the file's current state.
                        setConfigLoadError(getConfigLoadError());

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

    const handleTabSwap = useCallback(() => {
        setScreen(getTabSwapScreen);
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
                    setConfigLoadError(getConfigLoadError());
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

    const handleExportConfig = useCallback(async (filePath: string) => {
        try {
            if (!settings) {
                return;
            }
            await exportConfig(settings, filePath);
            setFlashMessage({ text: `Config exported to ${filePath}`, color: 'green' });
        } catch (err) {
            setFlowNotice({
                title: 'Export Failed',
                message: err instanceof Error ? err.message : String(err),
                color: 'red',
                continueScreen: 'main'
            });
            setScreen('flowNotice');
            return;
        }
        setScreen('main');
    }, [settings]);

    const handleImportFileChosen = useCallback(async (filePath: string) => {
        const result = await validateImportFile(filePath);
        if (result.status === 'invalid') {
            setFlowNotice({
                title: 'Import Failed',
                message: result.reason,
                color: 'red',
                continueScreen: 'main'
            });
            setScreen('flowNotice');
        } else {
            setImportValidation(result);
            setScreen('importPreview');
        }
    }, []);

    const handleImportApply = useCallback((mode: 'replace' | 'merge') => {
        if (!settings || importValidation?.status !== 'valid') {
            return;
        }
        const importedSettings = applyTuiImport(
            settings,
            importValidation.data,
            mode,
            importValidation.presentKeys
        );
        setSettings(importedSettings);
        setHasChanges(true);
        setImportValidation(null);
        setFlashMessage({ text: 'Config imported — review and save', color: 'green' });
        setScreen('main');
    }, [importValidation, settings]);

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
            setConfigLoadError(getConfigLoadError());
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
                    setConfigLoadError(getConfigLoadError());
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
        const screenTarget = getMainMenuScreenTarget(value);

        if (screenTarget) {
            setScreen(screenTarget);
            return;
        }

        switch (value) {
            case 'install':
                handleInstallUninstall();
                break;
            case 'checkUpdates':
                setUpdatesReturnScreen('main');
                setScreen('updates');
                handleUpdateCheck();
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
            case 'save': {
                const saveAndExit = async () => {
                    try {
                        await saveSettings(settings);
                        setOriginalSettings(cloneSettings(settings));
                        setHasChanges(false);
                        exit();
                    } catch {
                        setFlashMessage({
                            text: '✗ Could not save configuration',
                            color: 'red'
                        });
                    }
                };

                // Save & Exit is the second explicit-save route (besides Ctrl+S); guard it
                // the same way so an invalid settings.json isn't overwritten without consent.
                const saveGuard = buildInvalidConfigSaveConfirm(configLoadError, () => {
                    setConfirmDialog(null);
                    setScreen('main');
                    void saveAndExit();
                });
                if (saveGuard) {
                    setConfirmDialog(saveGuard);
                    setScreen('confirm');
                } else {
                    await saveAndExit();
                }
                break;
            }
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

    const configWarning = buildConfigLoadWarning(configLoadError);

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
            {configWarning && (
                <Text color='red' wrap='wrap'>{configWarning}</Text>
            )}
            {isCustomConfigPath() && (
                <Text dimColor>{`Config: ${getConfigPath()}`}</Text>
            )}

            <StatusLinePreview
                lines={settings.lines}
                terminalWidth={terminalWidth}
                settings={settings}
                preRenderedLines={preRenderedLines}
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
                    />
                )}
                {screen === 'items' && (
                    <ItemsEditor
                        widgets={settings.lines[selectedLine] ?? []}
                        onUpdate={(widgets) => { updateLine(selectedLine, widgets); }}
                        onBack={() => {
                            // When going back to lines menu, preserve which line was selected
                            setMenuSelections(prev => ({ ...prev, lines: selectedLine }));
                            setScreen(EDITOR_BACK_SCREEN);
                        }}
                        lineNumber={selectedLine + 1}
                        settings={settings}
                        themeSlotContext={themeSlotContexts[selectedLine] ?? EMPTY_THEME_SLOT_CONTEXT}
                        onTabSwap={handleTabSwap}
                        onWidgetHighlight={handleWidgetHighlight}
                        initialWidgetId={activeWidgetId}
                    />
                )}
                {screen === 'colorsMoved' && (
                    <ColorEditingMovedNotice
                        onGoToWidgetEditor={() => {
                            // Land on the same line selector the widget editor uses
                            setMenuSelections(prev => ({ ...prev, main: 0 }));
                            setScreen('lines');
                        }}
                        onBack={() => {
                            // Save that we came from 'colors' menu (index 1)
                            setMenuSelections(prev => ({ ...prev, main: 1 }));
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'colors' && (
                    <ColorMenu
                        widgets={settings.lines[selectedLine] ?? []}
                        lineIndex={selectedLine}
                        settings={settings}
                        themeSlotContext={themeSlotContexts[selectedLine] ?? EMPTY_THEME_SLOT_CONTEXT}
                        editingBackground={colorEditingBackground}
                        onEditingBackgroundChange={setColorEditingBackground}
                        showSeparators={colorShowSeparators}
                        onShowSeparatorsChange={setColorShowSeparators}
                        onUpdate={(updatedWidgets) => {
                            // Update only the selected line
                            const newLines = [...settings.lines];
                            newLines[selectedLine] = updatedWidgets;
                            setSettings({ ...settings, lines: newLines });
                        }}
                        onBack={() => {
                            // Colors are a mode of the widget editor, so escape backs out
                            // to the same line selector the items mode returns to
                            setMenuSelections(prev => ({ ...prev, lines: selectedLine }));
                            setScreen(EDITOR_BACK_SCREEN);
                        }}
                        onTabSwap={handleTabSwap}
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

                {screen === 'exportConfig' && (
                    <ExportConfigDialog
                        onExport={(filePath) => { void handleExportConfig(filePath); }}
                        onCancel={() => { setScreen('main'); }}
                    />
                )}

                {screen === 'importConfig' && (
                    <ImportConfigDialog
                        onFileChosen={(filePath) => { void handleImportFileChosen(filePath); }}
                        onCancel={() => { setScreen('main'); }}
                    />
                )}

                {screen === 'importPreview' && importValidation?.status === 'valid' && (
                    <ImportPreviewDialog
                        validation={importValidation}
                        currentSettings={settings}
                        onApply={(mode) => { handleImportApply(mode); }}
                        onCancel={() => {
                            setImportValidation(null);
                            setScreen('main');
                        }}
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
