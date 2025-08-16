import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';

export type EditorMode = 'separator' | 'startCap' | 'endCap';

export interface PowerlineSeparatorEditorProps {
    settings: Settings;
    mode: EditorMode;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const PowerlineSeparatorEditor: React.FC<PowerlineSeparatorEditorProps> = ({
    settings,
    mode,
    onUpdate,
    onBack
}) => {
    const powerlineConfig = settings.powerline;

    // Get the appropriate array based on mode
    const getItems = () => {
        switch (mode) {
        case 'separator':
            return powerlineConfig.separators;
        case 'startCap':
            return powerlineConfig.startCaps;
        case 'endCap':
            return powerlineConfig.endCaps;
        }
    };

    const separators = getItems();
    const invertBgs = mode === 'separator'
        ? powerlineConfig.separatorInvertBackground
        : [];

    const [selectedIndex, setSelectedIndex] = useState(0);
    const [hexInputMode, setHexInputMode] = useState(false);
    const [hexInput, setHexInput] = useState('');
    const [cursorPos, setCursorPos] = useState(0);

    // Get presets based on mode
    const getPresets = () => {
        if (mode === 'separator') {
            return [
                { char: '\uE0B0', name: 'Triangle Right', hex: 'E0B0' },
                { char: '\uE0B2', name: 'Triangle Left', hex: 'E0B2' },
                { char: '\uE0B4', name: 'Round Right', hex: 'E0B4' },
                { char: '\uE0B6', name: 'Round Left', hex: 'E0B6' }
            ];
        } else if (mode === 'startCap') {
            return [
                { char: '\uE0B2', name: 'Triangle', hex: 'E0B2' },
                { char: '\uE0B6', name: 'Round', hex: 'E0B6' },
                { char: '\uE0BA', name: 'Lower Triangle', hex: 'E0BA' },
                { char: '\uE0BE', name: 'Diagonal', hex: 'E0BE' }
            ];
        } else {
            return [
                { char: '\uE0B0', name: 'Triangle', hex: 'E0B0' },
                { char: '\uE0B4', name: 'Round', hex: 'E0B4' },
                { char: '\uE0B8', name: 'Lower Triangle', hex: 'E0B8' },
                { char: '\uE0BC', name: 'Diagonal', hex: 'E0BC' }
            ];
        }
    };

    const presetSeparators = getPresets();

    const getSeparatorDisplay = (char: string, index: number): string => {
        const preset = presetSeparators.find(p => p.char === char);
        const invertBg = invertBgs[index] ?? false;
        if (preset) {
            // Show inversion status for all separators in separator mode
            const inversionText = mode === 'separator' && invertBg ? ' [Inverted]' : '';
            return `${preset.char} - ${preset.name}${inversionText}`;
        }
        const hexCode = char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
        return `${char} - Custom (\\u${hexCode})${invertBg ? ' [Inverted]' : ''}`;
    };

    const updateSeparators = (newSeparators: string[], newInvertBgs?: boolean[]) => {
        const updatedPowerline = { ...powerlineConfig };

        switch (mode) {
        case 'separator':
            updatedPowerline.separators = newSeparators;
            updatedPowerline.separatorInvertBackground = newInvertBgs ?? newSeparators.map((_, i) => invertBgs[i] ?? false);
            break;
        case 'startCap':
            updatedPowerline.startCaps = newSeparators;
            break;
        case 'endCap':
            updatedPowerline.endCaps = newSeparators;
            break;
        }

        onUpdate({
            ...settings,
            powerline: updatedPowerline
        });
    };

    useInput((input, key) => {
        if (hexInputMode) {
            // Hex input mode
            if (key.escape) {
                setHexInputMode(false);
                setHexInput('');
                setCursorPos(0);
            } else if (key.return) {
                if (hexInput.length === 4) {
                    const char = String.fromCharCode(parseInt(hexInput, 16));
                    const newSeparators = [...separators];
                    if (separators.length === 0) {
                        // Add new item if list is empty
                        newSeparators.push(char);
                    } else {
                        newSeparators[selectedIndex] = char;
                    }
                    updateSeparators(newSeparators);
                    setHexInputMode(false);
                    setHexInput('');
                    setCursorPos(0);
                }
            } else if (key.backspace && cursorPos > 0) {
                setHexInput(hexInput.slice(0, cursorPos - 1) + hexInput.slice(cursorPos));
                setCursorPos(cursorPos - 1);
            } else if (input && /[0-9a-fA-F]/.test(input) && hexInput.length < 4) {
                setHexInput(hexInput.slice(0, cursorPos) + input.toUpperCase() + hexInput.slice(cursorPos));
                setCursorPos(cursorPos + 1);
            }
        } else {
            // Normal mode
            if (key.escape) {
                onBack();
            } else if (key.upArrow) {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            } else if (key.downArrow && separators.length > 0) {
                setSelectedIndex(Math.min(separators.length - 1, selectedIndex + 1));
            } else if ((key.leftArrow || key.rightArrow) && separators.length > 0) {
                // Cycle through preset separators
                const currentChar = separators[selectedIndex] ?? '\uE0B0';
                const currentPresetIndex = presetSeparators.findIndex(p => p.char === currentChar);
                const newSeparators = [...separators];
                const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];

                let newIndex;
                if (currentPresetIndex !== -1) {
                    // It's a preset, cycle to next/prev preset
                    if (key.rightArrow) {
                        newIndex = (currentPresetIndex + 1) % presetSeparators.length;
                    } else {
                        newIndex = currentPresetIndex === 0 ? presetSeparators.length - 1 : currentPresetIndex - 1;
                    }
                } else {
                    // It's a custom separator, cycle to first or last preset
                    if (key.rightArrow) {
                        newIndex = 0; // Go to first preset
                    } else {
                        newIndex = presetSeparators.length - 1; // Go to last preset
                    }
                }

                const newChar = presetSeparators[newIndex]?.char ?? presetSeparators[0]?.char ?? '\uE0B0';
                newSeparators[selectedIndex] = newChar;

                // Auto-set inversion for left-facing separators (Triangle Left \uE0B2 or Round Left \uE0B6)
                if (mode === 'separator') {
                    const isLeftFacing = newChar === '\uE0B2' || newChar === '\uE0B6';
                    newInvertBgs[selectedIndex] = isLeftFacing;
                }

                updateSeparators(newSeparators, mode === 'separator' ? newInvertBgs : undefined);
            } else if ((input === 'a' || input === 'A') && (mode === 'separator' || separators.length < 3)) {
                // Add after current (max 3 for caps)
                const newSeparators = [...separators];
                const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];
                const defaultChar = presetSeparators[0]?.char ?? '\uE0B0';
                const isLeftFacing = defaultChar === '\uE0B2' || defaultChar === '\uE0B6';
                if (separators.length === 0) {
                    // If empty, just add at the beginning
                    newSeparators.push(defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.push(isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    setSelectedIndex(0);
                } else {
                    // Add after current selected item
                    newSeparators.splice(selectedIndex + 1, 0, defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.splice(selectedIndex + 1, 0, isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    setSelectedIndex(selectedIndex + 1);
                }
            } else if ((input === 'i' || input === 'I') && (mode === 'separator' || separators.length < 3)) {
                // Insert before current (max 3 for caps)
                const newSeparators = [...separators];
                const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];
                const defaultChar = presetSeparators[0]?.char ?? '\uE0B0';
                const isLeftFacing = defaultChar === '\uE0B2' || defaultChar === '\uE0B6';
                if (separators.length === 0) {
                    // If empty, just add at the beginning
                    newSeparators.push(defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.push(isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    setSelectedIndex(0);
                } else {
                    // Insert before current selected item
                    newSeparators.splice(selectedIndex, 0, defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.splice(selectedIndex, 0, isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    // Keep selection on the newly inserted item (which is now at selectedIndex)
                }
            } else if ((input === 'd' || input === 'D') && (mode !== 'separator' || separators.length > 1)) {
                // Delete current (min 1 for separator, no min for caps)
                const newSeparators = separators.filter((_, i) => i !== selectedIndex);
                const newInvertBgs = mode === 'separator' ? invertBgs.filter((_, i) => i !== selectedIndex) : [];
                updateSeparators(newSeparators, newInvertBgs);
                setSelectedIndex(Math.min(selectedIndex, Math.max(0, newSeparators.length - 1)));
            } else if (input === 'c' || input === 'C') {
                // Clear all
                if (mode === 'separator') {
                    // Reset to default right-facing separator with no inversion
                    updateSeparators(['\uE0B0'], [false]);
                } else {
                    updateSeparators([]);
                }
                setSelectedIndex(0);
            } else if (input === 'h' || input === 'H') {
                // Enter hex input mode
                setHexInputMode(true);
                setHexInput('');
                setCursorPos(0);
            } else if ((input === 't' || input === 'T') && mode === 'separator') {
                // Toggle background inversion (for all separators in separator mode)
                const newInvertBgs = [...invertBgs];
                newInvertBgs[selectedIndex] = !(newInvertBgs[selectedIndex] ?? false);
                updateSeparators(separators, newInvertBgs);
            }
        }
    });

    const getTitle = () => {
        switch (mode) {
        case 'separator':
            return 'Powerline Separator Configuration';
        case 'startCap':
            return 'Powerline Start Cap Configuration';
        case 'endCap':
            return 'Powerline End Cap Configuration';
        }
    };

    const canAdd = mode === 'separator' || separators.length < 3;
    const canDelete = mode !== 'separator' || separators.length > 1;

    return (
        <Box flexDirection='column'>
            <Text bold>{getTitle()}</Text>

            {hexInputMode ? (
                <Box marginTop={2} flexDirection='column'>
                    <Text>
                        Enter 4-digit hex code for
                        {' '}
                        {mode === 'separator' ? 'separator' : 'cap'}
                        {separators.length > 0 ? ` ${selectedIndex + 1}` : ''}
                        :
                    </Text>
                    <Text>
                        \u
                        {hexInput.slice(0, cursorPos)}
                        <Text backgroundColor='gray' color='black'>{hexInput[cursorPos] ?? '_'}</Text>
                        {hexInput.slice(cursorPos + 1)}
                        {hexInput.length < 4 && hexInput.length === cursorPos && <Text dimColor>{'_'.repeat(4 - hexInput.length - 1)}</Text>}
                    </Text>
                    <Text dimColor>Enter 4 hex digits (0-9, A-F), then press Enter. ESC to cancel.</Text>
                </Box>
            ) : (
                <>
                    <Box>
                        <Text dimColor>
                            {`↑↓ select, ← → cycle${canAdd ? ', (a)dd, (i)nsert' : ''}${canDelete ? ', (d)elete' : ''}, (c)lear, (h)ex${mode === 'separator' ? ', (t)oggle invert' : ''}, ESC back`}
                        </Text>
                    </Box>

                    <Box marginTop={2} flexDirection='column'>
                        {separators.length > 0 ? (
                            separators.map((sep, index) => (
                                <Box key={index}>
                                    <Text color={index === selectedIndex ? 'green' : undefined}>
                                        {index === selectedIndex ? '▶  ' : '   '}
                                        {`${index + 1}: ${getSeparatorDisplay(sep, index)}`}
                                    </Text>
                                </Box>
                            ))
                        ) : (
                            <Text dimColor>(none configured - press 'a' to add)</Text>
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};