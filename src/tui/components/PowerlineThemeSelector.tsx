import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useRef,
    useState
} from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import {
    getPowerlineTheme,
    getPowerlineThemes
} from '../../utils/colors';

import { ConfirmDialog } from './ConfirmDialog';

export interface PowerlineThemeSelectorProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const PowerlineThemeSelector: React.FC<PowerlineThemeSelectorProps> = ({
    settings,
    onUpdate,
    onBack
}) => {
    const themes = getPowerlineThemes();
    const currentTheme = settings.powerline.theme ?? 'custom';
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, themes.indexOf(currentTheme)));
    const [showCustomizeConfirm, setShowCustomizeConfirm] = useState(false);
    const originalThemeRef = useRef(currentTheme);
    const originalSettingsRef = useRef(settings);

    const applyTheme = (themeName: string) => {
        // Simply change the theme setting, don't modify widget colors
        const updatedSettings = {
            ...settings,
            powerline: {
                ...settings.powerline,
                theme: themeName
            }
        };
        onUpdate(updatedSettings);
    };

    const customizeTheme = () => {
        // Copy current theme's colors to widgets and switch to custom theme
        const currentThemeName = themes[selectedIndex];
        if (!currentThemeName) {
            return;
        }
        const theme = getPowerlineTheme(currentThemeName);

        if (!theme || currentThemeName === 'custom') {
            // If already on custom, just go back
            onBack();
            return;
        }

        const colorLevel = getColorLevelString(settings.colorLevel);
        const colorLevelKey = colorLevel === 'ansi16' ? '1' : colorLevel === 'ansi256' ? '2' : '3';
        const themeColors = theme[colorLevelKey];

        if (themeColors) {
            // Apply theme colors to widgets
            const newLines = settings.lines.map((line) => {
                let widgetColorIndex = 0;
                return line.map((widget) => {
                    // Skip separators
                    if (widget.type === 'separator' || widget.type === 'flex-separator') {
                        return widget;
                    }

                    const fgColor = themeColors.fg[widgetColorIndex % themeColors.fg.length];
                    const bgColor = themeColors.bg[widgetColorIndex % themeColors.bg.length];
                    widgetColorIndex++;

                    return {
                        ...widget,
                        color: fgColor,
                        backgroundColor: bgColor
                    };
                });
            });

            const updatedSettings = {
                ...settings,
                powerline: {
                    ...settings.powerline,
                    theme: 'custom'
                },
                lines: newLines
            };

            onUpdate(updatedSettings);
        }

        onBack();
    };

    useInput((input, key) => {
        // Skip input handling when confirmation is active - let ConfirmDialog handle it
        if (showCustomizeConfirm) {
            return;
        }
        {
            // Normal input handling
            if (key.escape) {
                // Restore original settings completely when canceling
                onUpdate(originalSettingsRef.current);
                onBack();
            } else if (key.upArrow) {
                const newIndex = Math.max(0, selectedIndex - 1);
                setSelectedIndex(newIndex);
                const newTheme = themes[newIndex];
                if (newTheme) {
                    applyTheme(newTheme);
                }
            } else if (key.downArrow) {
                const newIndex = Math.min(themes.length - 1, selectedIndex + 1);
                setSelectedIndex(newIndex);
                const newTheme = themes[newIndex];
                if (newTheme) {
                    applyTheme(newTheme);
                }
            } else if (key.return) {
                // User confirmed their selection, so we keep the current theme
                onBack();
            } else if (input === 'c' || input === 'C') {
                // Customize theme - copy theme colors to widgets
                const currentThemeName = themes[selectedIndex];
                if (currentThemeName && currentThemeName !== 'custom') {
                    setShowCustomizeConfirm(true);
                }
            }
        }
    });

    const selectedThemeName = themes[selectedIndex];
    const selectedTheme = selectedThemeName ? getPowerlineTheme(selectedThemeName) : undefined;

    if (showCustomizeConfirm) {
        return (
            <Box flexDirection='column'>
                <Text bold color='yellow'>⚠ Confirm Customization</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text>This will copy the current theme colors to your widgets</Text>
                    <Text>and switch to Custom theme mode.</Text>
                    <Text color='red'>This will overwrite any existing custom colors!</Text>
                </Box>
                <Box marginTop={2}>
                    <Text>Continue?</Text>
                </Box>
                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            customizeTheme();
                            setShowCustomizeConfirm(false);
                        }}
                        onCancel={() => {
                            setShowCustomizeConfirm(false);
                        }}
                    />
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>
                {`Powerline Theme Selection  |  `}
                <Text dimColor>
                    {`Original: ${originalThemeRef.current}`}
                </Text>
            </Text>
            <Box>
                <Text dimColor>
                    {`↑↓ navigate, Enter apply${selectedThemeName && selectedThemeName !== 'custom' ? ', (c)ustomize theme' : ''}, ESC cancel`}
                </Text>
            </Box>

            <Box marginTop={1} flexDirection='column'>
                {themes.map((themeName, index) => {
                    const theme = getPowerlineTheme(themeName);
                    const isSelected = index === selectedIndex;
                    const isOriginal = themeName === originalThemeRef.current;

                    return (
                        <Box key={themeName}>
                            <Text color={isSelected ? 'green' : undefined}>
                                {isSelected ? '▶ ' : '  '}
                                {theme?.name ?? themeName}
                                {isOriginal && <Text dimColor> (original)</Text>}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            {selectedTheme && (
                <Box marginTop={2} flexDirection='column'>
                    <Text dimColor>Description:</Text>
                    <Box marginLeft={2}>
                        <Text>{selectedTheme.description}</Text>
                    </Box>
                    {selectedThemeName && selectedThemeName !== 'custom' && (
                        <Box marginTop={1}>
                            <Text dimColor>Press (c) to customize this theme - copies colors to widgets</Text>
                        </Box>
                    )}
                    {settings.colorLevel === 1 && (
                        <Box>
                            <Text color='yellow'>⚠ 16 color mode themes have a very limited palette, we recommend switching color level in Terminal Options</Text>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};