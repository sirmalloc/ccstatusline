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

import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';
import {
    CCSTATUSLINE_COMMANDS,
    getClaudeSettingsPath,
    getExistingStatusLine,
    installStatusLine,
    isBunxAvailable,
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
    saveSettings
} from '../utils/config';
import { openExternalUrl } from '../utils/open-url';
import {
    checkPowerlineFonts,
    checkPowerlineFontsAsync,
    installPowerlineFonts,
    type PowerlineFontStatus
} from '../utils/powerline';
import { getPackageVersion } from '../utils/terminal';

import { loadClaudeStatusLineState } from './claude-status';
import {
    ColorMenu,
    ConfirmDialog,
    GlobalOverridesMenu,
    InstallMenu,
    ItemsEditor,
    LineSelector,
    MainMenu,
    PowerlineSetup,
    RefreshIntervalMenu,
    StatusLinePreview,
    TerminalOptionsMenu,
    TerminalWidthMenu,
    type MainMenuOption
} from './components';

const GITHUB_REPO_URL = 'https://github.com/sirmalloc/ccstatusline';

interface FlashMessage {
    text: string;
    color: 'green' | 'red';
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
    | 'refreshInterval';

interface ConfirmDialogState {
    message: string;
    action: () => Promise<void>;
    cancelScreen?: Exclude<AppScreen, 'confirm'>;
}

export function getConfirmCancelScreen(confirmDialog: ConfirmDialogState | null): Exclude<AppScreen, 'confirm'> {
    return confirmDialog?.cancelScreen ?? 'main';
}

export function clearInstallMenuSelection(menuSelections: Record<string, number>): Record<string, number> {
    if (menuSelections.install === undefined) {
        return menuSelections;
    }

    const next = { ...menuSelections };
    delete next.install;
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

    useEffect(() => {
        void loadClaudeStatusLineState().then((statusLineState) => {
            setExistingStatusLine(statusLineState.existingStatusLine);
            setCurrentRefreshInterval(statusLineState.refreshInterval);
        });
        void loadSettings().then((loadedSettings) => {
            // Set global chalk level based on settings (default to 256 colors for compatibility)
            chalk.level = loadedSettings.colorLevel;
            setSettings(loadedSettings);
            setOriginalSettings(cloneSettings(loadedSettings));
        });
        void isInstalled().then(setIsClaudeInstalled);

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

    const handleInstallSelection = useCallback((command: string, displayName: string, useBunx: boolean) => {
        void getExistingStatusLine().then((existing) => {
            const isAlreadyInstalled = isKnownCommand(existing ?? '');
            let message: string;

            if (existing && !isAlreadyInstalled) {
                message = `This will modify ${getClaudeSettingsPath()}\n\nA status line is already configured: "${existing}"\nReplace it with ${command}?`;
            } else if (isAlreadyInstalled) {
                message = `ccstatusline is already installed in ${getClaudeSettingsPath()}\nUpdate it with ${command}?`;
            } else {
                message = `This will modify ${getClaudeSettingsPath()} to add ccstatusline with ${displayName}.\nContinue?`;
            }

            setConfirmDialog({
                message,
                cancelScreen: 'install',
                action: async () => {
                    await installStatusLine(useBunx, supportsRefreshInterval);
                    const installedStatusLineState = await loadClaudeStatusLineState();
                    setIsClaudeInstalled(true);
                    setExistingStatusLine(installedStatusLineState.existingStatusLine ?? command);
                    setCurrentRefreshInterval(installedStatusLineState.refreshInterval);
                    setScreen('main');
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        });
    }, [supportsRefreshInterval]);

    const handleNpxInstall = useCallback(() => {
        setMenuSelections(prev => ({ ...prev, install: 0 }));
        handleInstallSelection(CCSTATUSLINE_COMMANDS.NPM, 'npx', false);
    }, [handleInstallSelection]);

    const handleBunxInstall = useCallback(() => {
        setMenuSelections(prev => ({ ...prev, install: 1 }));
        handleInstallSelection(CCSTATUSLINE_COMMANDS.BUNX, 'bunx', true);
    }, [handleInstallSelection]);

    const handleInstallMenuCancel = useCallback(() => {
        setMenuSelections(clearInstallMenuSelection);
        setScreen('main');
    }, []);

    if (!settings) {
        return <Text>Loading settings...</Text>;
    }

    const handleInstallUninstall = () => {
        if (isClaudeInstalled) {
            // Uninstall
            setConfirmDialog({
                message: `This will remove ccstatusline from ${getClaudeSettingsPath()}. Continue?`,
                action: async () => {
                    await uninstallStatusLine();
                    setIsClaudeInstalled(false);
                    setExistingStatusLine(null);
                    setCurrentRefreshInterval(null);
                    setScreen('main');
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        } else {
            // Show install menu to select npx or bunx
            setScreen('install');
        }
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
                    {` | ${getPackageVersion() && `v${getPackageVersion()}`}`}
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
                {screen === 'install' && (
                    <InstallMenu
                        bunxAvailable={isBunxAvailable()}
                        existingStatusLine={existingStatusLine}
                        onSelectNpx={handleNpxInstall}
                        onSelectBunx={handleBunxInstall}
                        onCancel={handleInstallMenuCancel}
                        initialSelection={menuSelections.install}
                    />
                )}
                {screen === 'refreshInterval' && (
                    <RefreshIntervalMenu
                        currentInterval={currentRefreshInterval}
                        supportsRefreshInterval={supportsRefreshInterval}
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