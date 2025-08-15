import {
    Box,
    Text,
    useInput
} from 'ink';
import SelectInput from 'ink-select-input';
import React, { useState } from 'react';

import {
    type FlexMode,
    type Settings
} from '../../utils/config';

export interface TerminalWidthOptionsProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const TerminalWidthOptions: React.FC<TerminalWidthOptionsProps> = ({ settings, onUpdate, onBack }) => {
    const [selectedOption, setSelectedOption] = useState<FlexMode>(settings.flexMode);
    const [compactThreshold, setCompactThreshold] = useState(settings.compactThreshold);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdInput, setThresholdInput] = useState(String(settings.compactThreshold));
    const [validationError, setValidationError] = useState<string | null>(null);
    const [highlightedOption, setHighlightedOption] = useState<FlexMode>(settings.flexMode);

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
            }
        }
    });

    const options = [
        {
            value: 'full' as FlexMode,
            label: 'Full width always',
            description: 'Uses the full terminal width minus 4 characters for terminal padding. If the auto-compact message appears, it may cause the line to wrap. This is due to a limitation where we cannot accurately detect the available width.\n\nNOTE: If /ide integration is enabled, it\'s not recommended to use this mode as stuff like opening a file will cause text to appear on the right of the terminal that will force the status line to wrap.'
        },
        {
            value: 'full-minus-40' as FlexMode,
            label: 'Full width minus 40 (default)',
            description: 'Leaves a gap to the right of the status line to accommodate the auto-compact message. This prevents wrapping but may leave unused space. This limitation exists because we cannot detect when the message will appear.'
        },
        {
            value: 'full-until-compact' as FlexMode,
            label: 'Full width until compact',
            description: `Dynamically adjusts width based on context usage. When context reaches ${compactThreshold}%, it switches to leaving space for the auto-compact message. This provides a balance but requires guessing when the message appears.\n\nNOTE: If /ide integration is enabled, it's not recommended to use this mode as stuff like opening a file will cause text to appear on the right of the terminal that will force the status line to wrap.`
        }
    ];

    const handleSelect = (item: { value: string }) => {
        const mode = item.value as FlexMode;
        setSelectedOption(mode);

        // Always update both flexMode and compactThreshold together
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
    };

    const menuItems = options.map(opt => ({
        label: opt.label + (opt.value === selectedOption ? ' ✓' : ''),
        value: opt.value as string
    }));
    menuItems.push({ label: '← Back', value: 'back' });

    const currentOption = options.find(o => o.value === highlightedOption);

    return (
        <Box flexDirection='column'>
            <Text bold>Terminal Width Options</Text>
            <Text color='white'>These settings affect where long lines are truncated, and where right-alignment occurs when using flex separators</Text>
            <Text dimColor wrap='wrap'>These settings are necessary because claude code does not currently provide an available width variable for the statusline and features like IDE integration, auto-compaction notices, and rate limit messages can all cause the statusline to wrap if we do not truncate it</Text>

            {editingThreshold ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter compact threshold (1-99):
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
                    <Box marginTop={1}>
                        <SelectInput
                            items={menuItems}
                            initialIndex={options.findIndex(o => o.value === selectedOption)}
                            onHighlight={(item) => {
                                if (item.value !== 'back') {
                                    setHighlightedOption(item.value as FlexMode);
                                }
                            }}
                            onSelect={(item) => {
                                if (item.value === 'back') {
                                    onBack();
                                } else {
                                    handleSelect(item);
                                }
                            }}
                            indicatorComponent={({ isSelected }) => (
                                <Text>{isSelected ? '▶' : '  '}</Text>
                            )}
                            itemComponent={({ isSelected, label }) => (
                                <Text color={isSelected ? 'green' : undefined}>
                                    {' '}
                                    {label}
                                </Text>
                            )}
                        />
                    </Box>

                    {currentOption && (
                        <Box marginTop={1} marginBottom={1} borderStyle='round' borderColor='dim' paddingX={1}>
                            <Box flexDirection='column'>
                                <Text>
                                    <Text color='yellow'>{currentOption.label}</Text>
                                    {highlightedOption === 'full-until-compact' && ` | Current threshold: ${compactThreshold}%`}
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