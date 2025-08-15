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

import {
    getExistingStatusLine,
    installStatusLine,
    isInstalled,
    uninstallStatusLine
} from '../utils/claude-settings';
import {
    loadSettings,
    saveSettings,
    type Settings,
    type StatusItem
} from '../utils/config';
import {
    checkPowerlineFonts,
    checkPowerlineFontsAsync,
    installPowerlineFonts,
    type PowerlineFontStatus
} from '../utils/powerline';

import {
    ColorMenu,
    ConfirmDialog,
    GlobalOverridesMenu,
    ItemsEditor,
    LineSelector,
    MainMenu,
    PowerlineConfiguration,
    StatusLinePreview,
    TerminalConfigMenu,
    TerminalWidthOptions
} from './components';
import { getPackageVersion } from './utils/terminal';

export const App: React.FC = () => {
    const { exit } = useApp();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [screen, setScreen] = useState<'main' | 'lines' | 'items' | 'colors' | 'terminalWidth' | 'terminalConfig' | 'globalOverrides' | 'confirm' | 'powerline'>('main');
    const [selectedLine, setSelectedLine] = useState(0);
    const [menuSelections, setMenuSelections] = useState<Record<string, number>>({});
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; action: () => Promise<void> } | null>(null);
    const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
    const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);
    const [powerlineFontStatus, setPowerlineFontStatus] = useState<PowerlineFontStatus>({ installed: false });
    const [installingFonts, setInstallingFonts] = useState(false);
    const [fontInstallMessage, setFontInstallMessage] = useState<string | null>(null);

    useEffect(() => {
        void loadSettings().then((loadedSettings) => {
            // Set global chalk level based on settings (default to 256 colors for compatibility)
            chalk.level = loadedSettings.colorLevel;
            // Ensure lines array has 3 slots
            while (loadedSettings.lines.length < 3) {
                loadedSettings.lines.push([]);
            }
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

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            exit();
        }
    });

    if (!settings) {
        return <Text>Loading settings...</Text>;
    }

    const handleInstallUninstall = async () => {
        if (isClaudeInstalled) {
            // Uninstall
            setConfirmDialog({
                message: 'This will remove ccstatusline from ~/.claude/settings.json. Continue?',
                action: async () => {
                    await uninstallStatusLine();
                    setIsClaudeInstalled(false);
                    setScreen('main');
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        } else {
            // Always ask for consent before modifying Claude settings
            const existing = await getExistingStatusLine();
            let message: string;

            if (existing && existing !== 'npx -y ccstatusline@latest') {
                message = `This will modify ~/.claude/settings.json\n\nA status line is already configured: "${existing}"\nReplace it with npx -y ccstatusline@latest?`;
            } else if (existing === 'npx -y ccstatusline@latest') {
                message = 'ccstatusline is already installed in ~/.claude/settings.json\nUpdate it with the latest options?';
            } else {
                message = 'This will modify ~/.claude/settings.json to add ccstatusline.\nContinue?';
            }

            setConfirmDialog({
                message,
                action: async () => {
                    await installStatusLine();
                    setIsClaudeInstalled(true);
                    setScreen('main');
                    setConfirmDialog(null);
                }
            });
            setScreen('confirm');
        }
    };

    const handleMainMenuSelect = async (value: string) => {
        switch (value) {
        case 'lines':
            setScreen('lines');
            break;
        case 'colors':
            setScreen('colors');
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
            await handleInstallUninstall();
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

    const updateLine = (lineIndex: number, items: StatusItem[]) => {
        const newLines = [...settings.lines];
        newLines[lineIndex] = items;
        setSettings({ ...settings, lines: newLines });
    };

    const handleLineSelect = (lineIndex: number) => {
        setSelectedLine(lineIndex);
        setScreen('items');
    };

    return (
        <Box flexDirection='column' padding={1}>
            <Box marginBottom={1}>
                <Text bold>
                    <Gradient name='retro'>
                        CCStatusline Configuration
                    </Gradient>
                </Text>
                <Text bold>
                    {` | ${getPackageVersion() && `v${getPackageVersion()}`}`}
                </Text>
            </Box>

            <Box marginBottom={1}>
                <Text dimColor>Preview:</Text>
            </Box>
            <StatusLinePreview lines={settings.lines} terminalWidth={terminalWidth} settings={settings} />

            <Box marginTop={2}>
                {screen === 'main' && (
                    <MainMenu
                        onSelect={(value) => {
                            // Only persist menu selection if not exiting
                            if (value !== 'save' && value !== 'exit') {
                                const menuMap: Record<string, number> = {
                                    lines: 0,
                                    colors: 1,
                                    powerline: 2,
                                    terminalWidth: 3,
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
                    />
                )}
                {screen === 'lines' && (
                    <LineSelector
                        lines={settings.lines}
                        onSelect={(line) => {
                            setMenuSelections({ ...menuSelections, lines: line });
                            handleLineSelect(line);
                        }}
                        onBack={() => {
                            // Save that we came from 'lines' menu (index 0)
                            // Clear the line selection so it resets next time we enter
                            setMenuSelections({ ...menuSelections, main: 0 });
                            setScreen('main');
                        }}
                        initialSelection={menuSelections.lines}
                    />
                )}
                {screen === 'items' && (
                    <ItemsEditor
                        items={settings.lines[selectedLine] ?? []}
                        onUpdate={(items) => { updateLine(selectedLine, items); }}
                        onBack={() => {
                            // When going back to lines menu, preserve which line was selected
                            setMenuSelections({ ...menuSelections, lines: selectedLine });
                            setScreen('lines');
                        }}
                        lineNumber={selectedLine + 1}
                    />
                )}
                {screen === 'colors' && (
                    <ColorMenu
                        items={settings.lines.flat().map(item => ({ ...item }))}
                        settings={settings}
                        onUpdate={(items) => {
                            // This is a bit tricky - we need to update colors across all lines
                            // For now, just update the flat list
                            // IMPORTANT: Create a deep copy to avoid mutating the original
                            const newLines = settings.lines.map(line => [...line]);
                            let flatIndex = 0;
                            for (const line of newLines) {
                                for (let itemIndex = 0; itemIndex < line.length; itemIndex++) {
                                    const item = items[flatIndex];
                                    if (flatIndex < items.length && item) {
                                        // Create a new object to avoid mutation
                                        line[itemIndex] = { ...item };
                                        flatIndex++;
                                    }
                                }
                            }
                            setSettings({ ...settings, lines: newLines });
                        }}
                        onBack={() => {
                            // Save that we came from 'colors' menu (index 1)
                            setMenuSelections({ ...menuSelections, main: 1 });
                            setScreen('main');
                        }}
                    />
                )}
                {screen === 'terminalConfig' && (
                    <TerminalConfigMenu
                        settings={settings}
                        onUpdate={(updatedSettings) => {
                            setSettings(updatedSettings);
                        }}
                        onBack={(target?: string) => {
                            if (target === 'width') {
                                setScreen('terminalWidth');
                            } else {
                                // Save that we came from 'terminalConfig' menu (index 4 - accounting for gaps)
                                setMenuSelections({ ...menuSelections, main: 4 });
                                setScreen('main');
                            }
                        }}
                    />
                )}
                {screen === 'terminalWidth' && (
                    <TerminalWidthOptions
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
                            // Save that we came from 'globalOverrides' menu (index 3 - accounting for gaps)
                            setMenuSelections({ ...menuSelections, main: 3 });
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
                {screen === 'powerline' && (
                    <PowerlineConfiguration
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
                            void installPowerlineFonts().then((result) => {
                                setInstallingFonts(false);
                                setFontInstallMessage(result.message);
                                // Refresh font status
                                void checkPowerlineFontsAsync().then((asyncStatus) => {
                                    setPowerlineFontStatus(asyncStatus);
                                });
                            });
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