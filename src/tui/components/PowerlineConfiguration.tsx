import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../utils/config';
import { type PowerlineFontStatus } from '../../utils/powerline';

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
    const [editingMode, setEditingMode] = useState<'separator' | 'startCap' | 'endCap' | null>(null);
    const [customInput, setCustomInput] = useState('');
    const [cursorPos, setCursorPos] = useState(0);
    const [confirmingEnable, setConfirmingEnable] = useState(false);

    // Common powerline separators (thin ones don't work well, so excluded)
    const separators = [
        { char: '\uE0B0', name: 'Triangle Right', hex: 'E0B0' },
        { char: '\uE0B2', name: 'Triangle Left', hex: 'E0B2' },
        { char: '\uE0B4', name: 'Round Right', hex: 'E0B4' },
        { char: '\uE0B6', name: 'Round Left', hex: 'E0B6' }
    ];

    // Start caps (left-facing)
    const startCaps = [
        { char: '', name: 'None', hex: '' },
        { char: '\uE0B2', name: 'Triangle', hex: 'E0B2' },
        { char: '\uE0B6', name: 'Round', hex: 'E0B6' },
        { char: '\uE0BA', name: 'Lower Triangle', hex: 'E0BA' },
        { char: '\uE0BE', name: 'Diagonal', hex: 'E0BE' }
    ];

    // End caps (right-facing)
    const endCaps = [
        { char: '', name: 'None', hex: '' },
        { char: '\uE0B0', name: 'Triangle', hex: 'E0B0' },
        { char: '\uE0B4', name: 'Round', hex: 'E0B4' },
        { char: '\uE0B8', name: 'Lower Triangle', hex: 'E0B8' },
        { char: '\uE0BC', name: 'Diagonal', hex: 'E0BC' }
    ];

    const currentSeparatorIndex = separators.findIndex(s => s.char === (powerlineConfig.separator ?? '\uE0B0'));
    const currentStartCapIndex = startCaps.findIndex(c => c.char === (powerlineConfig.startCap ?? ''));
    const currentEndCapIndex = endCaps.findIndex(c => c.char === (powerlineConfig.endCap ?? ''));

    useInput((input, key) => {
        if (fontInstallMessage) {
            onClearMessage();
            return;
        }

        if (confirmingEnable) {
            if (input === 'y' || input === 'Y') {
                // Remove all separators and flex-separators from lines
                const updatedSettings = {
                    ...settings,
                    powerline: { ...powerlineConfig, enabled: true },
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

        if (editingMode) {
            // Custom hex input mode
            if (key.escape) {
                setEditingMode(null);
                setCustomInput('');
                setCursorPos(0);
            } else if (key.return) {
                if (customInput.length === 4) {
                    const char = String.fromCharCode(parseInt(customInput, 16));
                    const newConfig = { ...powerlineConfig };

                    if (editingMode === 'separator') {
                        newConfig.separator = char;
                    } else if (editingMode === 'startCap') {
                        newConfig.startCap = char;
                    } else {
                        newConfig.endCap = char;
                    }

                    onUpdate({ ...settings, powerline: newConfig });
                    setEditingMode(null);
                    setCustomInput('');
                    setCursorPos(0);
                }
            } else if (key.backspace && cursorPos > 0) {
                setCustomInput(customInput.slice(0, cursorPos - 1) + customInput.slice(cursorPos));
                setCursorPos(cursorPos - 1);
            } else if (input && /[0-9a-fA-F]/.test(input) && customInput.length < 4) {
                setCustomInput(customInput.slice(0, cursorPos) + input.toUpperCase() + customInput.slice(cursorPos));
                setCursorPos(cursorPos + 1);
            }
        } else {
            // Normal navigation mode
            if (key.escape) {
                onBack();
            } else if (input === 't' || input === 'T') {
                // Toggle powerline mode
                if (!powerlineConfig.enabled) {
                    // Show confirmation when enabling
                    setConfirmingEnable(true);
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
            } else if (powerlineConfig.enabled) {
                // These options only work when powerline is enabled
                if (input === 'q' || input === 'Q') {
                    // Cycle separator left
                    const newIndex = currentSeparatorIndex <= 0 ? separators.length - 1 : currentSeparatorIndex - 1;
                    const newConfig = { ...powerlineConfig, separator: separators[newIndex]?.char ?? '\uE0B0' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'w' || input === 'W') {
                    // Cycle separator right
                    const newIndex = (currentSeparatorIndex + 1) % separators.length;
                    const newConfig = { ...powerlineConfig, separator: separators[newIndex]?.char ?? '\uE0B0' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'e' || input === 'E') {
                    // Edit separator with custom hex
                    setEditingMode('separator');
                    setCustomInput('');
                    setCursorPos(0);
                } else if (input === 'a' || input === 'A') {
                    // Cycle start cap left
                    const newIndex = currentStartCapIndex <= 0 ? startCaps.length - 1 : currentStartCapIndex - 1;
                    const newConfig = { ...powerlineConfig, startCap: startCaps[newIndex]?.char ?? '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 's' || input === 'S') {
                    // Cycle start cap right
                    const newIndex = (currentStartCapIndex + 1) % startCaps.length;
                    const newConfig = { ...powerlineConfig, startCap: startCaps[newIndex]?.char ?? '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'd' || input === 'D') {
                    // Edit start cap with custom hex
                    setEditingMode('startCap');
                    setCustomInput('');
                    setCursorPos(0);
                } else if (input === 'z' || input === 'Z') {
                    // Cycle end cap left
                    const newIndex = currentEndCapIndex <= 0 ? endCaps.length - 1 : currentEndCapIndex - 1;
                    const newConfig = { ...powerlineConfig, endCap: endCaps[newIndex]?.char ?? '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'x' || input === 'X') {
                    // Cycle end cap right
                    const newIndex = (currentEndCapIndex + 1) % endCaps.length;
                    const newConfig = { ...powerlineConfig, endCap: endCaps[newIndex]?.char ?? '' };
                    onUpdate({ ...settings, powerline: newConfig });
                } else if (input === 'c' || input === 'C') {
                    // Edit end cap with custom hex
                    setEditingMode('endCap');
                    setCustomInput('');
                    setCursorPos(0);
                }
            }
        }
    });

    const currentSeparator = separators[currentSeparatorIndex] ?? { char: powerlineConfig.separator ?? '\uE0B0', name: 'Custom', hex: 'Custom' };
    const currentStartCap = startCaps[currentStartCapIndex] ?? { char: powerlineConfig.startCap ?? '', name: 'Custom', hex: 'Custom' };
    const currentEndCap = endCaps[currentEndCapIndex] ?? { char: powerlineConfig.endCap ?? '', name: 'Custom', hex: 'Custom' };

    return (
        <Box flexDirection='column'>
            <Text bold>Powerline Configuration</Text>

            {confirmingEnable ? (
                <Box flexDirection='column' marginTop={2}>
                    <Box marginBottom={1}>
                        <Text color='yellow'>⚠ Warning: Enabling Powerline mode will remove all existing separators and flex-separators from your status lines.</Text>
                    </Box>
                    <Box marginBottom={1}>
                        <Text dimColor>Powerline mode uses its own separator system and is incompatible with manual separators.</Text>
                    </Box>
                    <Box marginTop={1}>
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
            ) : editingMode ? (
                <Box marginTop={2} flexDirection='column'>
                    <Text>
                        Enter 4-digit hex code for
                        {editingMode === 'separator' ? 'separator' : editingMode === 'startCap' ? 'start cap' : 'end cap'}
                        :
                    </Text>
                    <Text>
                        \u
                        {customInput.slice(0, cursorPos)}
                        <Text backgroundColor='gray' color='black'>{customInput[cursorPos] ?? '_'}</Text>
                        {customInput.slice(cursorPos + 1)}
                        {customInput.length < 4 && customInput.length === cursorPos && <Text dimColor>{'_'.repeat(4 - customInput.length - 1)}</Text>}
                    </Text>
                    <Text dimColor>Enter 4 hex digits (0-9, A-F), then press Enter. ESC to cancel.</Text>
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
                        <>
                            <Box flexDirection='column'>
                                <Text dimColor>When enabled, global overrides are disabled and powerline separators are used</Text>
                            </Box>

                            <Box marginTop={2}>
                                <Text>
                                    Separator:
                                    {' '}
                                    {currentSeparator.char ? `${currentSeparator.char} (${currentSeparator.name})` : '(none)'}
                                </Text>
                                <Text dimColor> - (q/w) cycle, (e) custom hex</Text>
                            </Box>

                            <Box>
                                <Text>
                                    Start Cap:
                                    {' '}
                                    {currentStartCap.char ? `${currentStartCap.char} (${currentStartCap.name})` : '(none)'}
                                </Text>
                                <Text dimColor> - (a/s) cycle, (d) custom hex</Text>
                            </Box>

                            <Box>
                                <Text>
                                    {'  '}
                                    End Cap:
                                    {' '}
                                    {currentEndCap.char ? `${currentEndCap.char} (${currentEndCap.name})` : '(none)'}
                                </Text>
                                <Text dimColor> - (z/x) cycle, (c) custom hex</Text>
                            </Box>
                        </>
                    )}

                    <Box marginTop={2}>
                        <Text dimColor>Press ESC to go back</Text>
                    </Box>
                </>
            )}
        </Box>
    );
};