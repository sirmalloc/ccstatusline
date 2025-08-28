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
    useEffect,
    useState
} from 'react';

import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';
import {
    getExistingStatusLine,
    installStatusLine,
    isBunxAvailable,
    isInstalled,
    uninstallStatusLine
} from '../utils/claude-settings';
import {
    loadSettings,
    saveSettings
} from '../utils/config';
import {
    checkPowerlineFonts,
    checkPowerlineFontsAsync,
    installPowerlineFonts,
    type PowerlineFontStatus
} from '../utils/powerline';
import { getPackageVersion } from '../utils/terminal';

import {
    ColorMenu,
    ConfirmDialog,
    GlobalOverridesMenu,
    InstallMenu,
    ItemsEditor,
    LineSelector,
    MainMenu,
    PowerlineSetup,
    StatusLinePreview,
    TerminalOptionsMenu,
    TerminalWidthMenu
} from './components';

export const App: React.FC = () => {
    const { exit } = useApp();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [screen, setScreen] = useState<'main' | 'lines' | 'items' | 'colorLines' | 'colors' | 'terminalWidth' | 'terminalConfig' | 'globalOverrides' | 'confirm' | 'powerline' | 'install'>('main');
    const [selectedLine, setSelectedLine] = useState(0);
    const [menuSelections, setMenuSelections] = useState<Record<string, number>>({});
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; action: () => Promise<void> } | null>(null);
    const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
    const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);
    const [powerlineFontStatus, setPowerlineFontStatus] = useState<PowerlineFontStatus>({ installed: false });
    const [installingFonts, setInstallingFonts] = useState(false);
    const [fontInstallMessage, setFontInstallMessage] = useState<string | null>(null);
    const [existingStatusLine, setExistingStatusLine] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [previewIsTruncated, setPreviewIsTruncated] = useState(false);

    useEffect(() => {
        // Load existing status line
        void getExistingStatusLine().then(setExistingStatusLine);

        void loadSettings().then((loadedSettings) => {
            // Set global chalk level based on settings (default to 256 colors for compatibility)
            chalk.level = loadedSettings.colorLevel;
            setSettings(loadedSettings);
            setOriginalSettings(JSON.parse(JSON.stringify(loadedSettings)) as Settings); // Deep copy
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

    // Clear save message after 2 seconds
    useEffect(() => {
        if (saveMessage) {
            const timer = setTimeout(() => {
                setSaveMessage(null);
            }, 2000);
            return () => { clearTimeout(timer); };
        }
    }, [saveMessage]);

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            exit();
        }
        // Global save shortcut
        if (key.ctrl && input === 's' && settings) {
            void (async () => {
                await saveSettings(settings);
                setOriginalSettings(JSON.parse(JSON.stringify(settings)) as Settings);
                setHasChanges(false);
                setSaveMessage('✓ Configuration saved');
            })();
        }
    });

    if (!settings) {
        return <Text>Loading settings...</Text>;
    }

    const handleInstallUninstall = () => {
        if (isClaudeInstalled) {
            // Uninstall
            setConfirmDialog({
                message: 'This will remove ccstatusline from ~/.claude/settings.json. Continue?',
                action: async () => {
                    await uninstallStatusLine();
                    setIsClaudeInstalled(false);
                    setExistingStatusLine(null);
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

    const handleMainMenuSelect = async (value: string) => {
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
        case 'save':
            await saveSettings(settings);
            setOriginalSettings(JSON.parse(JSON.stringify(settings)) as Settings); // Update original after save
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
                {saveMessage && (
                    <Text color='green' bold>
                        {`  ${saveMessage}`}
                    </Text>
                )}
            </Box>

            <StatusLinePreview
                lines={settings.lines}
                terminalWidth={terminalWidth}
                settings={settings}
                onTruncationChange={setPreviewIsTruncated}
            />

            <Box marginTop={1}>
                {screen === 'main' && (
                    <MainMenu
                        onSelect={(value) => {
                            // Only persist menu selection if not exiting
                            if (value !== 'save' && value !== 'exit') {
                                const menuMap: Record<string, number> = {
                                    lines: 0,
                                    colors: 1,
                                    powerline: 2,
                                    terminalConfig: 3,
                                    globalOverrides: 4,
                                    install: 5
                                };
                                setMenuSelections({ ...menuSelections, main: menuMap[value] ?? 0 });
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
                            setMenuSelections({ ...menuSelections, lines: line });
                            handleLineSelect(line);
                        }}
                        onLinesUpdate={updateLines}
                        onBack={() => {
                            // Save that we came from 'lines' menu (index 0)
                            // Clear the line selection so it resets next time we enter
                            setMenuSelections({ ...menuSelections, main: 0 });
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
                            setMenuSelections({ ...menuSelections, lines: selectedLine });
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
                            setMenuSelections({ ...menuSelections, lines: line });
                            setSelectedLine(line);
                            setScreen('colors');
                        }}
                        onBack={() => {
                            // Save that we came from 'colors' menu (index 1)
                            setMenuSelections({ ...menuSelections, main: 1 });
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
                                setMenuSelections({ ...menuSelections, main: 3 });
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
                            setMenuSelections({ ...menuSelections, main: 4 });
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'confirm' && confirmDialog && (
                    <ConfirmDialog
                        message={confirmDialog.message}
                        onConfirm={() => void confirmDialog.action()}
                        onCancel={() => {
                            setScreen('main');
                            setConfirmDialog(null);
                        }}
                    />
                )}
                {screen === 'install' && (
                    <InstallMenu
                        bunxAvailable={isBunxAvailable()}
                        existingStatusLine={existingStatusLine}
                        onSelectNpx={() => {
                            void getExistingStatusLine().then((existing) => {
                                const isAlreadyInstalled = ['npx -y ccstatusline@latest', 'bunx -y ccstatusline@latest'].includes(existing ?? '');
                                let message: string;

                                if (existing && !isAlreadyInstalled) {
                                    message = `This will modify ~/.claude/settings.json\n\nA status line is already configured: "${existing}"\nReplace it with npx -y ccstatusline@latest?`;
                                } else if (isAlreadyInstalled) {
                                    message = 'ccstatusline is already installed in ~/.claude/settings.json\nUpdate it with npx -y ccstatusline@latest?';
                                } else {
                                    message = 'This will modify ~/.claude/settings.json to add ccstatusline with npx.\nContinue?';
                                }

                                setConfirmDialog({
                                    message,
                                    action: async () => {
                                        await installStatusLine(false);
                                        setIsClaudeInstalled(true);
                                        setExistingStatusLine('npx -y ccstatusline@latest');
                                        setScreen('main');
                                        setConfirmDialog(null);
                                    }
                                });
                                setScreen('confirm');
                            });
                        }}
                        onSelectBunx={() => {
                            void getExistingStatusLine().then((existing) => {
                                const isAlreadyInstalled = ['npx -y ccstatusline@latest', 'bunx -y ccstatusline@latest'].includes(existing ?? '');
                                let message: string;

                                if (existing && !isAlreadyInstalled) {
                                    message = `This will modify ~/.claude/settings.json\n\nA status line is already configured: "${existing}"\nReplace it with bunx -y ccstatusline@latest?`;
                                } else if (isAlreadyInstalled) {
                                    message = 'ccstatusline is already installed in ~/.claude/settings.json\nUpdate it with bunx -y ccstatusline@latest?';
                                } else {
                                    message = 'This will modify ~/.claude/settings.json to add ccstatusline with bunx.\nContinue?';
                                }

                                setConfirmDialog({
                                    message,
                                    action: async () => {
                                        await installStatusLine(true);
                                        setIsClaudeInstalled(true);
                                        setExistingStatusLine('bunx -y ccstatusline@latest');
                                        setScreen('main');
                                        setConfirmDialog(null);
                                    }
                                });
                                setScreen('confirm');
                            });
                        }}
                        onCancel={() => {
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