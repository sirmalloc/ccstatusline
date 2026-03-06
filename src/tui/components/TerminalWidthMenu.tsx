import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { FlexMode } from '../../types/FlexMode';
import type { Settings } from '../../types/Settings';
import { shouldInsertInput } from '../../utils/input-guards';

import {
    List,
    type ListEntry
} from './List';

export const TERMINAL_WIDTH_OPTIONS: FlexMode[] = ['full', 'full-minus-40', 'full-until-compact'];

export function getTerminalWidthSelectionIndex(selectedOption: FlexMode): number {
    const selectedIndex = TERMINAL_WIDTH_OPTIONS.indexOf(selectedOption);

    return selectedIndex >= 0 ? selectedIndex : 0;
}

export function validateCompactThresholdInput(value: string): string | null {
    const parsedValue = parseInt(value, 10);

    if (isNaN(parsedValue)) {
        return 'Please enter a valid number';
    }

    if (parsedValue < 1 || parsedValue > 99) {
        return `Value must be between 1 and 99 (you entered ${parsedValue})`;
    }

    return null;
}

export function buildTerminalWidthItems(
    selectedOption: FlexMode,
    compactThreshold: number
): ListEntry<FlexMode>[] {
    return [
        {
            value: 'full',
            label: 'Full width always',
            sublabel: selectedOption === 'full' ? '(active)' : undefined,
            description: 'Uses the full terminal width minus 4 characters for terminal padding. If the auto-compact message appears, it may cause the line to wrap.\n\nNOTE: If /ide integration is enabled, it is not recommended to use this mode.'
        },
        {
            value: 'full-minus-40',
            label: 'Full width minus 40',
            sublabel: selectedOption === 'full-minus-40' ? '(active)' : '(default)',
            description: 'Leaves a gap to the right of the status line to accommodate the auto-compact message. This prevents wrapping but may leave unused space. This limitation exists because we cannot detect when the message will appear.'
        },
        {
            value: 'full-until-compact',
            label: 'Full width until compact',
            sublabel: selectedOption === 'full-until-compact'
                ? `(threshold ${compactThreshold}%, active)`
                : `(threshold ${compactThreshold}%)`,
            description: `Dynamically adjusts width based on context usage. When context reaches ${compactThreshold}%, it switches to leaving space for the auto-compact message.\n\nNOTE: If /ide integration is enabled, it is not recommended to use this mode.`
        }
    ];
}

export interface TerminalWidthMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const TerminalWidthMenu: React.FC<TerminalWidthMenuProps> = ({
    settings,
    onUpdate,
    onBack
}) => {
    const [selectedOption, setSelectedOption] = useState<FlexMode>(settings.flexMode);
    const [compactThreshold, setCompactThreshold] = useState(settings.compactThreshold);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdInput, setThresholdInput] = useState(String(settings.compactThreshold));
    const [validationError, setValidationError] = useState<string | null>(null);

    useInput((input, key) => {
        if (editingThreshold) {
            if (key.return) {
                const error = validateCompactThresholdInput(thresholdInput);

                if (error) {
                    setValidationError(error);
                } else {
                    const value = parseInt(thresholdInput, 10);
                    setCompactThreshold(value);

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
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                const newValue = thresholdInput + input;
                if (newValue.length <= 2) {
                    setThresholdInput(newValue);
                    setValidationError(null);
                }
            }
            return;
        }

        if (key.escape) {
            onBack();
        }
    });

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
                <List
                    marginTop={1}
                    items={buildTerminalWidthItems(selectedOption, compactThreshold)}
                    initialSelection={getTerminalWidthSelectionIndex(selectedOption)}
                    onSelect={(value) => {
                        if (value === 'back') {
                            onBack();
                            return;
                        }

                        setSelectedOption(value);

                        const updatedSettings = {
                            ...settings,
                            flexMode: value,
                            compactThreshold
                        };
                        onUpdate(updatedSettings);

                        if (value === 'full-until-compact') {
                            setEditingThreshold(true);
                        }
                    }}
                    showBackButton={true}
                />
            )}
        </Box>
    );
};