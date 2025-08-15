import chalk, { type ChalkInstance } from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { type Settings } from '../../utils/config';

// Type for chalk color functions
type ChalkColorFunction = (text: string) => string;

export interface GlobalOverridesMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const GlobalOverridesMenu: React.FC<GlobalOverridesMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [editingPadding, setEditingPadding] = useState(false);
    const [editingSeparator, setEditingSeparator] = useState(false);
    const [paddingInput, setPaddingInput] = useState(settings.defaultPadding ?? '');
    const [separatorInput, setSeparatorInput] = useState(settings.defaultSeparator ?? '');
    const [inheritColors, setInheritColors] = useState(settings.inheritSeparatorColors);
    const [globalBold, setGlobalBold] = useState(settings.globalBold);
    const isPowerlineEnabled = settings.powerline.enabled ?? false;

    // Background color override
    const bgColors = ['none', 'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta',
        'bgCyan', 'bgWhite', 'bgGray', 'bgRedBright', 'bgGreenBright', 'bgYellowBright',
        'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright'];
    const currentBgIndex = bgColors.indexOf(settings.overrideBackgroundColor ?? 'none');

    // Foreground color override
    const fgColors = ['none', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'gray', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
        'magentaBright', 'cyanBright', 'whiteBright'];
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
                const updatedSettings = {
                    ...settings,
                    defaultSeparator: separatorInput
                };
                onUpdate(updatedSettings);
                setEditingSeparator(false);
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
        } else {
            if (key.escape) {
                onBack();
            } else if (input === 'p' || input === 'P') {
                setEditingPadding(true);
            } else if ((input === 's' || input === 'S') && !isPowerlineEnabled) {
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
            <Text dimColor>Configure automatic padding and separators between items</Text>
            {isPowerlineEnabled && (
                <Box marginTop={1}>
                    <Text color='yellow'>⚠ Some options are disabled while Powerline mode is active</Text>
                </Box>
            )}
            <Box marginTop={1} />

            {editingPadding ? (
                <Box flexDirection='column'>
                    <Box>
                        <Text>Enter default padding (applied to left and right of each item): </Text>
                        <Text color='cyan'>{paddingInput ? `"${paddingInput}"` : '(empty)'}</Text>
                    </Box>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
                </Box>
            ) : editingSeparator ? (
                <Box flexDirection='column'>
                    <Box>
                        <Text>Enter default separator (placed between items): </Text>
                        <Text color='cyan'>{separatorInput ? `"${separatorInput}"` : '(empty - no separator will be added)'}</Text>
                    </Box>
                    <Text dimColor>Press Enter to save, ESC to cancel</Text>
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
                                const fgFunc = (chalk as ChalkInstance & Record<string, ChalkColorFunction>)[fgColor] as ChalkColorFunction | undefined;
                                const display = fgFunc ? fgFunc(fgColor) : fgColor;
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
                                        const bgColorName = bgColor.replace(/^bg/, '').toLowerCase();
                                        const bgFunc = (chalk as ChalkInstance & Record<string, ChalkColorFunction>)[bgColor] as ChalkColorFunction | undefined;
                                        const display = bgFunc ? bgFunc(` ${bgColorName} `) : bgColorName;
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
                            Note: These settings are applied during rendering and don't add items to your widget list.
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Inherit colors: Default separators will use colors from the preceding widget
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Global Bold: Makes all text bold regardless of individual settings
                        </Text>
                        <Text dimColor wrap='wrap'>
                            • Override colors: All items will use these colors instead of their configured colors
                        </Text>
                        <Box marginTop={1} flexDirection='column'>
                            <Text color='yellow'>⚠ VSCode Users: </Text>
                            <Text dimColor wrap='wrap'>If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.</Text>
                        </Box>
                    </Box>
                </>
            )}
        </Box>
    );
};