import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import {
    COLOR_MAP,
    getChalkColor,
    getColorDisplayName
} from '../../utils/colors';

import { ConfirmDialog } from './ConfirmDialog';

export interface GlobalOverridesMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const GlobalOverridesMenu: React.FC<GlobalOverridesMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [editingPadding, setEditingPadding] = useState(false);
    const [editingSeparator, setEditingSeparator] = useState(false);
    const [confirmingSeparator, setConfirmingSeparator] = useState(false);
    const [paddingInput, setPaddingInput] = useState(settings.defaultPadding ?? '');
    const [separatorInput, setSeparatorInput] = useState(settings.defaultSeparator ?? '');
    const [inheritColors, setInheritColors] = useState(settings.inheritSeparatorColors);
    const [globalBold, setGlobalBold] = useState(settings.globalBold);
    const isPowerlineEnabled = settings.powerline.enabled;

    // Check if there are any manual separators in the current configuration
    const hasManualSeparators = settings.lines.some(line => line.some(item => item.type === 'separator')
    );

    // Get colors from COLOR_MAP
    const bgColors = ['none', ...COLOR_MAP.filter(c => c.isBackground).map(c => c.name)];
    const fgColors = ['none', ...COLOR_MAP.filter(c => !c.isBackground).map(c => c.name)];

    const currentBgIndex = bgColors.indexOf(settings.overrideBackgroundColor ?? 'none');
    const currentFgIndex = fgColors.indexOf(settings.overrideForegroundColor ?? 'none');

    useInput((input, key) => {
        if (editingPadding) {
            if (key.return) {
                const updatedSettings = {
                    ...settings,
                    defaultPadding: paddingInput
                };
                onUpdate(updatedSettings);
                setEditingPadding(false);
            } else if (key.escape) {
                setPaddingInput(settings.defaultPadding ?? '');
                setEditingPadding(false);
            } else if (key.backspace) {
                setPaddingInput(paddingInput.slice(0, -1));
            } else if (key.delete) {
                // For simple text inputs without cursor, forward delete does nothing
            } else if (input) {
                setPaddingInput(paddingInput + input);
            }
        } else if (editingSeparator) {
            if (key.return) {
                // Only show confirmation if setting a non-empty separator AND there are manual separators
                if (separatorInput && hasManualSeparators) {
                    setEditingSeparator(false);
                    setConfirmingSeparator(true);
                } else {
                    // Apply directly without confirmation
                    const updatedSettings = {
                        ...settings,
                        defaultSeparator: separatorInput || undefined,
                        // Only remove manual separators if we're setting a non-empty default
                        lines: separatorInput
                            ? settings.lines.map(line => line.filter(item => item.type !== 'separator'))
                            : settings.lines
                    };
                    onUpdate(updatedSettings);
                    setEditingSeparator(false);
                }
            } else if (key.escape) {
                setSeparatorInput(settings.defaultSeparator ?? '');
                setEditingSeparator(false);
            } else if (key.backspace) {
                setSeparatorInput(separatorInput.slice(0, -1));
            } else if (key.delete) {
                // For simple text inputs without cursor, forward delete does nothing
            } else if (input) {
                setSeparatorInput(separatorInput + input);
            }
        } else if (confirmingSeparator) {
            // Skip input handling when confirmation is active - let ConfirmDialog handle it
            return;
        } else {
            if (key.escape) {
                onBack();
            } else if (input === 'p' || input === 'P') {
                setEditingPadding(true);
            } else if ((input === 's' || input === 'S') && !isPowerlineEnabled && !key.ctrl) {
                setEditingSeparator(true);
            } else if ((input === 'i' || input === 'I') && !isPowerlineEnabled) {
                const newInheritColors = !inheritColors;
                setInheritColors(newInheritColors);
                const updatedSettings = {
                    ...settings,
                    inheritSeparatorColors: newInheritColors
                };
                onUpdate(updatedSettings);
            } else if ((input === 'b' || input === 'B') && !isPowerlineEnabled) {
                // Cycle through background colors
                const nextIndex = (currentBgIndex + 1) % bgColors.length;
                const nextBgColor = bgColors[nextIndex];
                const updatedSettings = {
                    ...settings,
                    overrideBackgroundColor: nextBgColor === 'none' ? undefined : nextBgColor
                };
                onUpdate(updatedSettings);
            } else if ((input === 'c' || input === 'C') && !isPowerlineEnabled) {
                // Clear override background color
                const updatedSettings = {
                    ...settings,
                    overrideBackgroundColor: undefined
                };
                onUpdate(updatedSettings);
            } else if (input === 'o' || input === 'O') {
                // Toggle global bold
                const newGlobalBold = !globalBold;
                setGlobalBold(newGlobalBold);
                const updatedSettings = {
                    ...settings,
                    globalBold: newGlobalBold
                };
                onUpdate(updatedSettings);
            } else if (input === 'f' || input === 'F') {
                // Cycle through foreground colors
                const nextIndex = (currentFgIndex + 1) % fgColors.length;
                const nextFgColor = fgColors[nextIndex];
                const updatedSettings = {
                    ...settings,
                    overrideForegroundColor: nextFgColor === 'none' ? undefined : nextFgColor
                };
                onUpdate(updatedSettings);
            } else if (input === 'g' || input === 'G') {
                // Clear override foreground color
                const updatedSettings = {
                    ...settings,
                    overrideForegroundColor: undefined
                };
                onUpdate(updatedSettings);
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Global Overrides</Text>
            <Text dimColor>Configure automatic padding and separators between widgets</Text>
            {isPowerlineEnabled && (
                <Box marginTop={1}>
                    <Text color='yellow'>⚠ Some options are disabled while Powerline mode is active</Text>
                </Box>
            )}
            <Box marginTop={1} />

            {editingPadding ? (
                <Box flexDirection='column'>
                    <Box>
                        <Text>Enter default padding (applied to left and right of each widget): </Text>
                        <Text color='cyan'>{paddingInput ? `"${paddingInput}"` : '(empty)'}</Text>
                    </Box>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : editingSeparator ? (
                <Box flexDirection='column'>
                    <Box>
                        <Text>Enter default separator (placed between widgets): </Text>
                        <Text color='cyan'>{separatorInput ? `"${separatorInput}"` : '(empty - no separator will be added)'}</Text>
                    </Box>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : confirmingSeparator ? (
                <Box flexDirection='column'>
                    <Box marginBottom={1}>
                        <Text color='yellow'>⚠ Warning: Setting a default separator will remove all existing manual separators from your status lines.</Text>
                    </Box>
                    <Box>
                        <Text>New default separator: </Text>
                        <Text color='cyan'>{separatorInput ? `"${separatorInput}"` : '(empty)'}</Text>
                    </Box>
                    <Box marginTop={1}>
                        <Text>Do you want to continue? </Text>
                    </Box>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={() => {
                                // Remove all manual separators from lines
                                const updatedSettings = {
                                    ...settings,
                                    defaultSeparator: separatorInput,
                                    lines: settings.lines.map(line => line.filter(item => item.type !== 'separator')
                                    )
                                };
                                onUpdate(updatedSettings);
                                setConfirmingSeparator(false);
                            }}
                            onCancel={() => {
                                // Cancel without applying changes
                                setSeparatorInput(settings.defaultSeparator ?? '');
                                setConfirmingSeparator(false);
                            }}
                        />
                    </Box>
                </Box>
            ) : (
                <>
                    <Box>
                        <Text>      Global Bold: </Text>
                        <Text color={globalBold ? 'green' : 'red'}>{globalBold ? '✓ Enabled' : '✗ Disabled'}</Text>
                        <Text dimColor> - Press (o) to toggle</Text>
                    </Box>

                    <Box>
                        <Text>  Default Padding: </Text>
                        <Text color='cyan'>{settings.defaultPadding ? `"${settings.defaultPadding}"` : '(none)'}</Text>
                        <Text dimColor> - Press (p) to edit</Text>
                    </Box>

                    <Box>
                        <Text>Override FG Color: </Text>
                        {(() => {
                            const fgColor = settings.overrideForegroundColor ?? 'none';
                            if (fgColor === 'none') {
                                return <Text color='gray'>(none)</Text>;
                            } else {
                                const displayName = getColorDisplayName(fgColor);
                                const fgChalk = getChalkColor(fgColor, 'ansi16', false);
                                const display = fgChalk ? fgChalk(displayName) : displayName;
                                return <Text>{display}</Text>;
                            }
                        })()}
                        <Text dimColor> - (f) cycle, (g) clear</Text>
                    </Box>

                    <Box>
                        <Text>Override BG Color: </Text>
                        {isPowerlineEnabled ? (
                            <Text dimColor>[disabled - Powerline active]</Text>
                        ) : (
                            <>
                                {(() => {
                                    const bgColor = settings.overrideBackgroundColor ?? 'none';
                                    if (bgColor === 'none') {
                                        return <Text color='gray'>(none)</Text>;
                                    } else {
                                        const displayName = getColorDisplayName(bgColor);
                                        const bgChalk = getChalkColor(bgColor, 'ansi16', true);
                                        const display = bgChalk ? bgChalk(` ${displayName} `) : displayName;
                                        return <Text>{display}</Text>;
                                    }
                                })()}
                                <Text dimColor> - (b) cycle, (c) clear</Text>
                            </>
                        )}
                    </Box>

                    <Box>
                        <Text>   Inherit Colors: </Text>
                        {isPowerlineEnabled ? (
                            <Text dimColor>[disabled - Powerline active]</Text>
                        ) : (
                            <>
                                <Text color={inheritColors ? 'green' : 'red'}>{inheritColors ? '✓ Enabled' : '✗ Disabled'}</Text>
                                <Text dimColor> - Press (i) to toggle</Text>
                            </>
                        )}
                    </Box>

                    <Box>
                        <Text>Default Separator: </Text>
                        {isPowerlineEnabled ? (
                            <Text dimColor>[disabled - Powerline active]</Text>
                        ) : (
                            <>
                                <Text color='cyan'>{settings.defaultSeparator ? `"${settings.defaultSeparator}"` : '(none)'}</Text>
                                <Text dimColor> - Press (s) to edit</Text>
                            </>
                        )}
                    </Box>

                    <Box marginTop={2}>
                        <Text dimColor>Press ESC to go back</Text>
                    </Box>

                    <Box marginTop={1} flexDirection='column'>
                        <Text dimColor wrap='wrap'>
                            Note: These settings are applied during rendering and don't add widgets to your widget list.
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Inherit colors: Separators will use colors from the preceding widget
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Global Bold: Makes all text bold regardless of individual settings
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Override colors: All widgets will use these colors instead of their configured colors
                        </Text>
                    </Box>
                </>
            )}
        </Box>
    );
};