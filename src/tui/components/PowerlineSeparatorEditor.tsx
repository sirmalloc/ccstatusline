import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import { shouldInsertInput } from '../../utils/input-guards';

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
    const [focusMode, setFocusMode] = useState(false);
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
        const codePoint = char.codePointAt(0) ?? 0;
        const hexCode = codePoint.toString(16).toUpperCase().padStart(4, '0');
        return `${char} - Custom (U+${hexCode})${invertBg ? ' [Inverted]' : ''}`;
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
            if (key.escape || key.leftArrow) {
                setHexInputMode(false);
                setHexInput('');
                setCursorPos(0);
            } else if (key.return) {
                if (hexInput.length >= 4 && hexInput.length <= 6) {
                    const codePoint = parseInt(hexInput, 16);
                    if (codePoint >= 0 && codePoint <= 0x10FFFF) {
                        const char = String.fromCodePoint(codePoint);
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
                }
            } else if (key.backspace && cursorPos > 0) {
                setHexInput(hexInput.slice(0, cursorPos - 1) + hexInput.slice(cursorPos));
                setCursorPos(cursorPos - 1);
            } else if (shouldInsertInput(input, key) && /[0-9a-fA-F]/.test(input) && hexInput.length < 6) {
                setHexInput(hexInput.slice(0, cursorPos) + input.toUpperCase() + hexInput.slice(cursorPos));
                setCursorPos(cursorPos + 1);
            }
        } else if (focusMode) {
            // Focus mode: edit the selected separator
            if (key.escape || key.return) {
                setFocusMode(false);
            } else if ((key.leftArrow || key.rightArrow) && separators.length > 0) {
                // Cycle through preset separators
                const currentChar = separators[selectedIndex] ?? '\uE0B0';
                const currentPresetIndex = presetSeparators.findIndex(p => p.char === currentChar);
                const newSeparators = [...separators];
                const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];

                let newIndex;
                if (currentPresetIndex !== -1) {
                    if (key.rightArrow) {
                        newIndex = (currentPresetIndex + 1) % presetSeparators.length;
                    } else {
                        newIndex = currentPresetIndex === 0 ? presetSeparators.length - 1 : currentPresetIndex - 1;
                    }
                } else {
                    if (key.rightArrow) {
                        newIndex = 0;
                    } else {
                        newIndex = presetSeparators.length - 1;
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
            } else if (key.upArrow && separators.length > 1) {
                // Reorder: move selected item up
                if (selectedIndex > 0) {
                    const newSeparators = [...separators];
                    const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];
                    const temp = newSeparators[selectedIndex - 1] ?? '';
                    newSeparators[selectedIndex - 1] = newSeparators[selectedIndex] ?? '';
                    newSeparators[selectedIndex] = temp;
                    if (mode === 'separator') {
                        const tempInvert = newInvertBgs[selectedIndex - 1] ?? false;
                        newInvertBgs[selectedIndex - 1] = newInvertBgs[selectedIndex] ?? false;
                        newInvertBgs[selectedIndex] = tempInvert;
                    }
                    updateSeparators(newSeparators, mode === 'separator' ? newInvertBgs : undefined);
                    setSelectedIndex(selectedIndex - 1);
                }
            } else if (key.downArrow && separators.length > 1) {
                // Reorder: move selected item down
                if (selectedIndex < separators.length - 1) {
                    const newSeparators = [...separators];
                    const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];
                    const temp = newSeparators[selectedIndex + 1] ?? '';
                    newSeparators[selectedIndex + 1] = newSeparators[selectedIndex] ?? '';
                    newSeparators[selectedIndex] = temp;
                    if (mode === 'separator') {
                        const tempInvert = newInvertBgs[selectedIndex + 1] ?? false;
                        newInvertBgs[selectedIndex + 1] = newInvertBgs[selectedIndex] ?? false;
                        newInvertBgs[selectedIndex] = tempInvert;
                    }
                    updateSeparators(newSeparators, mode === 'separator' ? newInvertBgs : undefined);
                    setSelectedIndex(selectedIndex + 1);
                }
            } else {
                const cmd = input.toLowerCase();
                if (cmd === 't' && mode === 'separator') {
                    // Toggle background inversion
                    const newInvertBgs = [...invertBgs];
                    newInvertBgs[selectedIndex] = !(newInvertBgs[selectedIndex] ?? false);
                    updateSeparators(separators, newInvertBgs);
                }
            }
        } else {
            // Normal mode
            const cmd = input.toLowerCase();
            if (key.escape || key.leftArrow) {
                onBack();
            } else if (key.upArrow && separators.length > 0) {
                setSelectedIndex(selectedIndex <= 0 ? separators.length - 1 : selectedIndex - 1);
            } else if (key.downArrow && separators.length > 0) {
                setSelectedIndex(selectedIndex >= separators.length - 1 ? 0 : selectedIndex + 1);
            } else if (key.return && separators.length > 0) {
                setFocusMode(true);
            } else if (cmd === 'a' && (mode === 'separator' || separators.length < 3)) {
                // Add after current (max 3 for caps)
                const newSeparators = [...separators];
                const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];
                const defaultChar = presetSeparators[0]?.char ?? '\uE0B0';
                const isLeftFacing = defaultChar === '\uE0B2' || defaultChar === '\uE0B6';
                if (separators.length === 0) {
                    newSeparators.push(defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.push(isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    setSelectedIndex(0);
                } else {
                    newSeparators.splice(selectedIndex + 1, 0, defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.splice(selectedIndex + 1, 0, isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    setSelectedIndex(selectedIndex + 1);
                }
            } else if (cmd === 'i' && (mode === 'separator' || separators.length < 3)) {
                // Insert before current (max 3 for caps)
                const newSeparators = [...separators];
                const newInvertBgs = mode === 'separator' ? [...invertBgs] : [];
                const defaultChar = presetSeparators[0]?.char ?? '\uE0B0';
                const isLeftFacing = defaultChar === '\uE0B2' || defaultChar === '\uE0B6';
                if (separators.length === 0) {
                    newSeparators.push(defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.push(isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                    setSelectedIndex(0);
                } else {
                    newSeparators.splice(selectedIndex, 0, defaultChar);
                    if (mode === 'separator') {
                        newInvertBgs.splice(selectedIndex, 0, isLeftFacing);
                    }
                    updateSeparators(newSeparators, newInvertBgs);
                }
            } else if (cmd === 'd' && (mode !== 'separator' || separators.length > 1)) {
                // Delete current (min 1 for separator, no min for caps)
                const newSeparators = separators.filter((_, i) => i !== selectedIndex);
                const newInvertBgs = mode === 'separator' ? invertBgs.filter((_, i) => i !== selectedIndex) : [];
                updateSeparators(newSeparators, newInvertBgs);
                setSelectedIndex(Math.min(selectedIndex, Math.max(0, newSeparators.length - 1)));
            } else if (cmd === 'c') {
                // Clear all
                if (mode === 'separator') {
                    updateSeparators(['\uE0B0'], [false]);
                } else {
                    updateSeparators([]);
                }
                setSelectedIndex(0);
            } else if (cmd === 'h') {
                // Enter hex input mode
                setHexInputMode(true);
                setHexInput('');
                setCursorPos(0);
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
                        Enter hex code (4-6 digits) for
                        {' '}
                        {mode === 'separator' ? 'separator' : 'cap'}
                        {separators.length > 0 ? ` ${selectedIndex + 1}` : ''}
                        :
                    </Text>
                    <Text>
                        U+
                        {hexInput.slice(0, cursorPos)}
                        <Text backgroundColor='gray' color='black'>{hexInput[cursorPos] ?? '_'}</Text>
                        {hexInput.slice(cursorPos + 1)}
                        {hexInput.length < 6 && hexInput.length === cursorPos && <Text dimColor>{'_'.repeat(6 - hexInput.length - 1)}</Text>}
                    </Text>
                    <Text dimColor>Enter 4-6 hex digits (0-9, A-F) for a Unicode code point, then press Enter. ESC to cancel.</Text>
                    <Text dimColor>Examples: E0B0 (powerline), 1F984 (🦄), 2764 (❤)</Text>
                </Box>
            ) : (
                <>
                    <Box>
                        <Text dimColor>
                            {focusMode
                                ? `←→ cycle preset, ↑↓ reorder${mode === 'separator' ? ', (t)oggle invert' : ''}, Enter/ESC exit`
                                : `↑↓ select, Enter: edit${canAdd ? ', (a)dd, (i)nsert' : ''}${canDelete ? ', (d)elete' : ''}, (c)lear, (h)ex, ← back`}
                        </Text>
                    </Box>

                    <Box marginTop={2} flexDirection='column'>
                        {separators.length > 0 ? (
                            separators.map((sep, index) => (
                                <Box key={index}>
                                    <Text color={index === selectedIndex ? (focusMode ? 'yellow' : 'green') : undefined}>
                                        {index === selectedIndex ? (focusMode ? '✎  ' : '▶  ') : '   '}
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