import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { FlexMode } from '../../types/FlexMode';
import type { Settings } from '../../types/Settings';

export interface TerminalWidthMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const TerminalWidthMenu: React.FC<TerminalWidthMenuProps> = ({ settings, onUpdate, onBack }) => {
    const [selectedOption, setSelectedOption] = useState<FlexMode>(settings.flexMode);
    const [compactThreshold, setCompactThreshold] = useState(settings.compactThreshold);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdInput, setThresholdInput] = useState(String(settings.compactThreshold));
    const [validationError, setValidationError] = useState<string | null>(null);

    // For manual navigation: 0-2 for options, 3 for back
    const [selectedIndex, setSelectedIndex] = useState(() => {
        const options: FlexMode[] = ['full', 'full-minus-40', 'full-until-compact'];
        return options.indexOf(settings.flexMode);
    });

    const options: FlexMode[] = ['full', 'full-minus-40', 'full-until-compact'];

    useInput((input, key) => {
        if (editingThreshold) {
            if (key.return) {
                const value = parseInt(thresholdInput, 10);
                if (isNaN(value)) {
                    setValidationError('Please enter a valid number');
                } else if (value < 1 || value > 99) {
                    setValidationError(`Value must be between 1 and 99 (you entered ${value})`);
                } else {
                    setCompactThreshold(value);
                    // Update settings with both flexMode and the new threshold
                    const updatedSettings = {
                        ...settings,
                        flexMode: selectedOption,
                        compactThreshold: value
                    };
                    onUpdate(updatedSettings);
                    setEditingThreshold(false);
                    setValidationError(null);
                }
            } else if (key.escape) {
                setThresholdInput(String(compactThreshold));
                setEditingThreshold(false);
                setValidationError(null);
            } else if (key.backspace) {
                setThresholdInput(thresholdInput.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // For simple number inputs, forward delete does nothing since there's no cursor position
            } else if (input && /\d/.test(input)) {
                const newValue = thresholdInput + input;
                if (newValue.length <= 2) {
                    setThresholdInput(newValue);
                    setValidationError(null);
                }
            }
        } else {
            if (key.escape) {
                onBack();
            } else if (key.upArrow) {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            } else if (key.downArrow) {
                setSelectedIndex(Math.min(3, selectedIndex + 1)); // 0-2 for options, 3 for back
            } else if (key.return) {
                if (selectedIndex === 3) {
                    onBack();
                } else if (selectedIndex >= 0 && selectedIndex < options.length) {
                    const mode = options[selectedIndex];
                    if (mode) {
                        setSelectedOption(mode);

                        // Update settings
                        const updatedSettings = {
                            ...settings,
                            flexMode: mode,
                            compactThreshold: compactThreshold
                        };
                        onUpdate(updatedSettings);

                        if (mode === 'full-until-compact') {
                            // Prompt for threshold editing
                            setEditingThreshold(true);
                        }
                    }
                }
            }
        }
    });

    const optionDetails = [
        {
            value: 'full' as FlexMode,
            label: 'Full width always',
            description: 'Uses the full terminal width minus 4 characters for terminal padding. If the auto-compact message appears, it may cause the line to wrap.\n\nNOTE: If /ide integration is enabled, it\'s not recommended to use this mode.'
        },
        {
            value: 'full-minus-40' as FlexMode,
            label: 'Full width minus 40 (default)',
            description: 'Leaves a gap to the right of the status line to accommodate the auto-compact message. This prevents wrapping but may leave unused space. This limitation exists because we cannot detect when the message will appear.'
        },
        {
            value: 'full-until-compact' as FlexMode,
            label: 'Full width until compact',
            description: `Dynamically adjusts width based on context usage. When context reaches ${compactThreshold}%, it switches to leaving space for the auto-compact message.\n\nNOTE: If /ide integration is enabled, it's not recommended to use this mode.`
        }
    ];

    const currentOption = selectedIndex < 3 ? optionDetails[selectedIndex] : null;

    return (
        <Box flexDirection='column'>
            <Text bold>Terminal Width</Text>
            <Text color='white'>These settings affect where long lines are truncated, and where right-alignment occurs when using flex separators</Text>
            <Text dimColor wrap='wrap'>Claude code does not currently provide an available width variable for the statusline and features like IDE integration, auto-compaction notices, etc all cause the statusline to wrap if we do not truncate it</Text>

            {editingThreshold ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter compact threshold (1-99):
                        {' '}
                        {thresholdInput}
                        %
                    </Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>Press Enter to confirm, ESC to cancel</Text>
                    )}
                </Box>
            ) : (
                <>
                    <Box marginTop={1} flexDirection='column'>
                        {optionDetails.map((opt, index) => (
                            <Box key={opt.value}>
                                <Text color={selectedIndex === index ? 'green' : undefined}>
                                    {selectedIndex === index ? '▶  ' : '   '}
                                    {opt.label}
                                    {opt.value === selectedOption ? ' ✓' : ''}
                                </Text>
                            </Box>
                        ))}

                        <Box marginTop={1}>
                            <Text color={selectedIndex === 3 ? 'green' : undefined}>
                                {selectedIndex === 3 ? '▶  ' : '   '}
                                ← Back
                            </Text>
                        </Box>
                    </Box>

                    {currentOption && (
                        <Box marginTop={1} marginBottom={1} borderStyle='round' borderColor='dim' paddingX={1}>
                            <Box flexDirection='column'>
                                <Text>
                                    <Text color='yellow'>{currentOption.label}</Text>
                                    {currentOption.value === 'full-until-compact' && ` | Current threshold: ${compactThreshold}%`}
                                </Text>
                                <Text dimColor wrap='wrap'>{currentOption.description}</Text>
                            </Box>
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
};