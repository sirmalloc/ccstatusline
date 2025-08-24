import {
    Box,
    Text,
    useInput
} from 'ink';
import * as os from 'os';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import { getDefaultPowerlineTheme } from '../../utils/colors';
import { type PowerlineFontStatus } from '../../utils/powerline';

import { ConfirmDialog } from './ConfirmDialog';
import { PowerlineSeparatorEditor } from './PowerlineSeparatorEditor';
import { PowerlineThemeSelector } from './PowerlineThemeSelector';

export interface PowerlineSetupProps {
    settings: Settings;
    powerlineFontStatus: PowerlineFontStatus;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
    onInstallFonts: () => void;
    installingFonts: boolean;
    fontInstallMessage: string | null;
    onClearMessage: () => void;
}

type Screen = 'menu' | 'separator' | 'startCap' | 'endCap' | 'themes';

export const PowerlineSetup: React.FC<PowerlineSetupProps> = ({
    settings,
    powerlineFontStatus,
    onUpdate,
    onBack,
    onInstallFonts,
    installingFonts,
    fontInstallMessage,
    onClearMessage
}) => {
    const powerlineConfig = settings.powerline;
    const [screen, setScreen] = useState<Screen>('menu');
    const [selectedMenuItem, setSelectedMenuItem] = useState(0);
    const [confirmingEnable, setConfirmingEnable] = useState(false);
    const [confirmingFontInstall, setConfirmingFontInstall] = useState(false);

    // Check if there are any separators or flex-separators in the current configuration
    const hasSeparatorItems = settings.lines.some(line => line.some(item => item.type === 'separator' || item.type === 'flex-separator'));

    // Menu items for navigation
    const menuItems = [
        { label: 'Separator', value: 'separator' },
        { label: 'Start Cap', value: 'startCap' },
        { label: 'End Cap', value: 'endCap' },
        { label: 'Themes', value: 'themes' },
        { label: '← Back', value: 'back' }
    ];

    // Helper functions for display
    const getSeparatorDisplay = (): string => {
        const seps = powerlineConfig.separators;
        if (seps.length > 1) {
            return 'multiple';
        }
        const sep = seps[0] ?? '\uE0B0';
        const presets = [
            { char: '\uE0B0', name: 'Triangle Right' },
            { char: '\uE0B2', name: 'Triangle Left' },
            { char: '\uE0B4', name: 'Round Right' },
            { char: '\uE0B6', name: 'Round Left' }
        ];
        const preset = presets.find(p => p.char === sep);
        if (preset) {
            return `${preset.char} - ${preset.name}`;
        }
        return `${sep} - Custom`;
    };

    const getCapDisplay = (type: 'start' | 'end'): string => {
        const caps = type === 'start'
            ? powerlineConfig.startCaps
            : powerlineConfig.endCaps;

        if (caps.length === 0)
            return 'none';
        if (caps.length > 1)
            return 'multiple';

        const cap = caps[0];
        if (!cap)
            return 'none';

        const presets = type === 'start' ? [
            { char: '\uE0B2', name: 'Triangle' },
            { char: '\uE0B6', name: 'Round' },
            { char: '\uE0BA', name: 'Lower Triangle' },
            { char: '\uE0BE', name: 'Diagonal' }
        ] : [
            { char: '\uE0B0', name: 'Triangle' },
            { char: '\uE0B4', name: 'Round' },
            { char: '\uE0B8', name: 'Lower Triangle' },
            { char: '\uE0BC', name: 'Diagonal' }
        ];

        const preset = presets.find(c => c.char === cap);
        if (preset) {
            return `${preset.char} - ${preset.name}`;
        }
        return `${cap} - Custom`;
    };

    const getThemeDisplay = (): string => {
        const theme = powerlineConfig.theme;
        if (!theme || theme === 'custom')
            return 'Custom';
        return theme.charAt(0).toUpperCase() + theme.slice(1);
    };

    useInput((input, key) => {
        // Block all input handling when font installation message is shown or installing
        if (fontInstallMessage || installingFonts) {
            // Only clear message on non-escape keys when message is shown
            if (fontInstallMessage && !key.escape) {
                onClearMessage();
            }
            // Always return early to prevent any other input handling
            return;
        }

        // Skip input handling when confirmations are active - let ConfirmDialog handle it
        if (confirmingFontInstall || confirmingEnable) {
            return;
        }

        if (screen === 'menu') {
            // Menu navigation mode
            if (key.escape) {
                onBack();
            } else if (key.upArrow) {
                setSelectedMenuItem(Math.max(0, selectedMenuItem - 1));
            } else if (key.downArrow) {
                setSelectedMenuItem(Math.min(menuItems.length - 1, selectedMenuItem + 1));
            } else if (key.return) {
                const selected = menuItems[selectedMenuItem];
                if (selected) {
                    if (selected.value === 'back') {
                        onBack();
                    } else if (powerlineConfig.enabled) {
                        setScreen(selected.value as Screen);
                    }
                }
            } else if (input === 't' || input === 'T') {
                // Toggle powerline mode
                if (!powerlineConfig.enabled) {
                    // Only show confirmation when enabling if there are separators to remove
                    if (hasSeparatorItems) {
                        setConfirmingEnable(true);
                    } else {
                        // Set to nord theme if currently custom or undefined (first time enabling)
                        const theme = (!powerlineConfig.theme || powerlineConfig.theme === 'custom')
                            ? getDefaultPowerlineTheme()
                            : powerlineConfig.theme;

                        // Enable directly without confirmation since there are no separators
                        const updatedSettings = {
                            ...settings,
                            powerline: {
                                ...powerlineConfig,
                                enabled: true,
                                theme,
                                // Separators are already initialized by Zod
                                separators: powerlineConfig.separators,
                                separatorInvertBackground: powerlineConfig.separatorInvertBackground
                            },
                            defaultPadding: ' '  // Set padding to space when enabling powerline
                        };
                        onUpdate(updatedSettings);
                    }
                } else {
                    // Disable without confirmation
                    const newConfig = { ...powerlineConfig, enabled: false };
                    onUpdate({ ...settings, powerline: newConfig });
                }
            } else if (input === 'i' || input === 'I') {
                // Show font installation consent prompt
                setConfirmingFontInstall(true);
            } else if ((input === 'a' || input === 'A') && powerlineConfig.enabled) {
                // Toggle autoAlign when powerline is enabled
                const newConfig = { ...powerlineConfig, autoAlign: !powerlineConfig.autoAlign };
                onUpdate({ ...settings, powerline: newConfig });
            }
        }
    });

    // Render sub-screens
    if (screen === 'separator') {
        return (
            <PowerlineSeparatorEditor
                settings={settings}
                mode='separator'
                onUpdate={onUpdate}
                onBack={() => { setScreen('menu'); }}
            />
        );
    }

    if (screen === 'startCap') {
        return (
            <PowerlineSeparatorEditor
                settings={settings}
                mode='startCap'
                onUpdate={onUpdate}
                onBack={() => { setScreen('menu'); }}
            />
        );
    }

    if (screen === 'endCap') {
        return (
            <PowerlineSeparatorEditor
                settings={settings}
                mode='endCap'
                onUpdate={onUpdate}
                onBack={() => { setScreen('menu'); }}
            />
        );
    }

    if (screen === 'themes') {
        return (
            <PowerlineThemeSelector
                settings={settings}
                onUpdate={onUpdate}
                onBack={() => { setScreen('menu'); }}
            />
        );
    }

    // Main menu screen
    return (
        <Box flexDirection='column'>
            {!confirmingFontInstall && !installingFonts && !fontInstallMessage && (
                <Text bold>Powerline Setup</Text>
            )}

            {confirmingFontInstall ? (
                <Box flexDirection='column'>
                    <Box marginBottom={1}>
                        <Text color='cyan' bold>Font Installation</Text>
                    </Box>

                    <Box marginBottom={1} flexDirection='column'>
                        <Text bold>What will happen:</Text>
                        <Text>
                            <Text dimColor>• Clone fonts from </Text>
                            <Text color='blue'>https://github.com/powerline/fonts</Text>
                        </Text>
                        {os.platform() === 'darwin' && (
                            <>
                                <Text dimColor>• Run install.sh script which will:</Text>
                                <Text dimColor>  - Copy all .ttf/.otf files to ~/Library/Fonts</Text>
                                <Text dimColor>  - Register fonts with macOS</Text>
                            </>
                        )}
                        {os.platform() === 'linux' && (
                            <>
                                <Text dimColor>• Run install.sh script which will:</Text>
                                <Text dimColor>  - Copy all .ttf/.otf files to ~/.local/share/fonts</Text>
                                <Text dimColor>  - Run fc-cache to update font cache</Text>
                            </>
                        )}
                        {os.platform() === 'win32' && (
                            <>
                                <Text dimColor>• Copy Powerline .ttf/.otf files to:</Text>
                                <Text dimColor>  AppData\Local\Microsoft\Windows\Fonts</Text>
                            </>
                        )}
                        <Text dimColor>• Clean up temporary files</Text>
                    </Box>

                    <Box marginBottom={1}>
                        <Text color='yellow' bold>Requirements: </Text>
                        <Text dimColor>Git installed, Internet connection, Write permissions</Text>
                    </Box>

                    <Box marginBottom={1} flexDirection='column'>
                        <Text color='green' bold>After install:</Text>
                        <Text dimColor>• Restart terminal</Text>
                        <Text dimColor>• Select a Powerline font</Text>
                        <Text dimColor>  (e.g. "Meslo LG S for Powerline")</Text>
                    </Box>

                    <Box marginTop={1}>
                        <Text>Proceed? </Text>
                    </Box>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={() => {
                                setConfirmingFontInstall(false);
                                onInstallFonts();
                            }}
                            onCancel={() => {
                                setConfirmingFontInstall(false);
                            }}
                        />
                    </Box>
                </Box>
            ) : confirmingEnable ? (
                <Box flexDirection='column' marginTop={1}>
                    {hasSeparatorItems && (
                        <>
                            <Box>
                                <Text color='yellow'>⚠ Warning: Enabling Powerline mode will remove all existing separators and flex-separators from your status lines.</Text>
                            </Box>
                            <Box marginBottom={1}>
                                <Text dimColor>Powerline mode uses its own separator system and is incompatible with manual separators.</Text>
                            </Box>
                        </>
                    )}
                    <Box marginTop={hasSeparatorItems ? 1 : 0}>
                        <Text>Do you want to continue? </Text>
                    </Box>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={() => {
                                // Set to nord theme if currently custom or undefined (first time enabling)
                                const theme = (!powerlineConfig.theme || powerlineConfig.theme === 'custom')
                                    ? getDefaultPowerlineTheme()
                                    : powerlineConfig.theme;

                                // Remove all separators and flex-separators from lines
                                // Also set default padding to a space when enabling powerline
                                const updatedSettings = {
                                    ...settings,
                                    powerline: {
                                        ...powerlineConfig,
                                        enabled: true,
                                        theme,
                                        // Separators are already initialized by Zod
                                        separators: powerlineConfig.separators,
                                        separatorInvertBackground: powerlineConfig.separatorInvertBackground
                                    },
                                    defaultPadding: ' ',  // Set padding to space when enabling powerline
                                    lines: settings.lines.map(line => line.filter(item => item.type !== 'separator' && item.type !== 'flex-separator')
                                    )
                                };
                                onUpdate(updatedSettings);
                                setConfirmingEnable(false);
                            }}
                            onCancel={() => {
                                setConfirmingEnable(false);
                            }}
                        />
                    </Box>
                </Box>
            ) : installingFonts ? (
                <Box>
                    <Text color='yellow'>Installing Powerline fonts... This may take a moment.</Text>
                </Box>
            ) : fontInstallMessage ? (
                <Box flexDirection='column'>
                    <Text color={fontInstallMessage.includes('success') ? 'green' : 'red'}>
                        {fontInstallMessage}
                    </Text>
                    <Box marginTop={1}>
                        <Text dimColor>Press any key to continue...</Text>
                    </Box>
                </Box>
            ) : (
                <>
                    <Box flexDirection='column'>
                        <Text>
                            {'    Font Status: '}
                            {powerlineFontStatus.installed ? (
                                <>
                                    <Text color='green'>✓ Installed</Text>
                                    <Text dimColor> - Ensure fonts are active in your terminal</Text>
                                </>
                            ) : (
                                <>
                                    <Text color='yellow'>✗ Not Installed</Text>
                                    <Text dimColor> - Press (i) to install Powerline fonts</Text>
                                </>
                            )}
                        </Text>
                    </Box>

                    <Box>
                        <Text> Powerline Mode: </Text>
                        <Text color={powerlineConfig.enabled ? 'green' : 'red'}>
                            {powerlineConfig.enabled ? '✓ Enabled  ' : '✗ Disabled '}
                        </Text>
                        <Text dimColor> - Press (t) to toggle</Text>
                    </Box>

                    {powerlineConfig.enabled && (
                        <>
                            <Box>
                                <Text>  Align Widgets: </Text>
                                <Text color={powerlineConfig.autoAlign ? 'green' : 'red'}>
                                    {powerlineConfig.autoAlign ? '✓ Enabled  ' : '✗ Disabled '}
                                </Text>
                                <Text dimColor> - Press (a) to toggle</Text>
                            </Box>

                            <Box flexDirection='column' marginTop={1}>
                                <Text dimColor>
                                    When enabled, global overrides are disabled and powerline separators are used
                                </Text>
                            </Box>
                        </>
                    )}

                    <Box marginTop={1} flexDirection='column'>
                        {powerlineConfig.enabled ? (
                            <>
                                {menuItems.map((item, index) => {
                                    const isSelected = index === selectedMenuItem;
                                    let displayValue = '';

                                    switch (item.value) {
                                    case 'separator':
                                        displayValue = getSeparatorDisplay();
                                        break;
                                    case 'startCap':
                                        displayValue = getCapDisplay('start');
                                        break;
                                    case 'endCap':
                                        displayValue = getCapDisplay('end');
                                        break;
                                    case 'themes':
                                        displayValue = getThemeDisplay();
                                        break;
                                    case 'back':
                                        displayValue = '';
                                        break;
                                    }

                                    if (item.value === 'back') {
                                        return (
                                            <Box key={item.value} marginTop={1}>
                                                <Text color={isSelected ? 'green' : undefined}>
                                                    {isSelected ? '▶  ' : '   '}
                                                    {item.label}
                                                </Text>
                                            </Box>
                                        );
                                    }

                                    return (
                                        <Box key={item.value}>
                                            <Text color={isSelected ? 'green' : undefined}>
                                                {isSelected ? '▶  ' : '   '}
                                                {item.label.padEnd(11, ' ')}
                                                <Text dimColor>
                                                    {displayValue && `(${displayValue})`}
                                                </Text>
                                            </Text>
                                        </Box>
                                    );
                                })}
                            </>
                        ) : (
                            // When powerline is disabled, show ESC to go back message
                            <Box marginTop={1}>
                                <Text dimColor>Press ESC to go back</Text>
                            </Box>
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};