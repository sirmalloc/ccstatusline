import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { getDefaultPowerlineTheme } from '../../utils/colors';
import type { Settings } from '../../utils/config';
import { type PowerlineFontStatus } from '../../utils/powerline';

import { PowerlineSeparatorEditor } from './PowerlineSeparatorEditor';
import { PowerlineThemeSelector } from './PowerlineThemeSelector';

export interface PowerlineConfigurationProps {
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

export const PowerlineConfiguration: React.FC<PowerlineConfigurationProps> = ({
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
        if (fontInstallMessage) {
            // Ignore escape key during font installation
            if (!key.escape) {
                onClearMessage();
            }
            return;
        }

        if (confirmingEnable) {
            if (input === 'y' || input === 'Y') {
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
            } else if (input === 'n' || input === 'N' || key.escape) {
                // Cancel without enabling
                setConfirmingEnable(false);
            }
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
                // Install fonts
                if (!installingFonts) {
                    onInstallFonts();
                }
            } else if (/^[1-5]$/.test(input)) {
                // Number key navigation for menu items
                const index = parseInt(input, 10) - 1;
                if (index < menuItems.length) {
                    const selected = menuItems[index];
                    if (selected?.value === 'back') {
                        onBack();
                    } else if (powerlineConfig.enabled && selected) {
                        setScreen(selected.value as Screen);
                    }
                }
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
            <Text bold>Powerline Configuration</Text>

            {confirmingEnable ? (
                <Box flexDirection='column' marginTop={2}>
                    {hasSeparatorItems && (
                        <>
                            <Box marginBottom={1}>
                                <Text color='yellow'>⚠ Warning: Enabling Powerline mode will remove all existing separators and flex-separators from your status lines.</Text>
                            </Box>
                            <Box marginBottom={1}>
                                <Text dimColor>Powerline mode uses its own separator system and is incompatible with manual separators.</Text>
                            </Box>
                        </>
                    )}
                    <Box marginTop={hasSeparatorItems ? 1 : 0}>
                        <Text>Do you want to continue? </Text>
                        <Text color='green'>(Y)es</Text>
                        <Text> / </Text>
                        <Text color='red'>(N)o</Text>
                    </Box>
                </Box>
            ) : installingFonts ? (
                <Box marginTop={2}>
                    <Text color='yellow'>Installing Powerline fonts... This may take a moment.</Text>
                </Box>
            ) : fontInstallMessage ? (
                <Box marginTop={2} flexDirection='column'>
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
                            {'   Font Status: '}
                            {powerlineFontStatus.installed ? (
                                <Text color='green'>✓ Installed</Text>
                            ) : (
                                <>
                                    <Text color='yellow'>✗ Not Installed</Text>
                                    <Text dimColor> - Press (i) to install Powerline fonts</Text>
                                </>
                            )}
                        </Text>
                    </Box>

                    <Box>
                        <Text>Powerline Mode: </Text>
                        <Text color={powerlineConfig.enabled ? 'green' : 'red'}>
                            {powerlineConfig.enabled ? '✓ Enabled' : '✗ Disabled'}
                        </Text>
                        <Text dimColor> - Press (t) to toggle</Text>
                    </Box>

                    {powerlineConfig.enabled && (
                        <Box flexDirection='column' marginTop={1}>
                            <Text dimColor>
                                When enabled, global overrides are disabled and powerline separators are used
                            </Text>
                        </Box>
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
                                                {`${index + 1}: ${item.label.padEnd(11, ' ')}`}
                                                <Text dimColor>
                                                    {displayValue && `(${displayValue})`}
                                                </Text>
                                            </Text>
                                        </Box>
                                    );
                                })}
                            </>
                        ) : (
                            // When powerline is disabled, only show the Back option
                            <Box>
                                <Text color={selectedMenuItem === menuItems.length - 1 ? 'green' : undefined}>
                                    {selectedMenuItem === menuItems.length - 1 ? '▶  ' : '   '}
                                    ← Back
                                </Text>
                            </Box>
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};