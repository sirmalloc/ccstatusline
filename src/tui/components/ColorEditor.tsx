import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    applyColors,
    getAvailableBackgroundColorsForUI,
    getAvailableColorsForUI
} from '../../utils/colors';
import { shouldInsertInput } from '../../utils/input-guards';
import { getWidget } from '../../utils/widgets';

export interface ColorEditorProps {
    widget: WidgetItem;
    settings: Settings;
    onUpdate: (updatedWidget: WidgetItem) => void;
    onReset?: () => void;  // Optional: for resetting to base widget colors
    onCancel: () => void;
}

export const ColorEditor: React.FC<ColorEditorProps> = ({
    widget,
    settings,
    onUpdate,
    onReset,
    onCancel
}) => {
    const [editingBackground, setEditingBackground] = useState(false);
    const [hexInputMode, setHexInputMode] = useState(false);
    const [hexInput, setHexInput] = useState('');
    const [ansi256InputMode, setAnsi256InputMode] = useState(false);
    const [ansi256Input, setAnsi256Input] = useState('');

    const widgetImpl = getWidget(widget.type);
    const defaultColor = widgetImpl?.getDefaultColor() ?? 'white';

    // Get available colors
    const colorOptions = getAvailableColorsForUI();
    const colors = colorOptions.map(c => c.value);
    const bgColorOptions = getAvailableBackgroundColorsForUI();
    const bgColors = bgColorOptions.map(c => c.value);

    // Cycle through colors
    const cycleColor = (direction: 1 | -1) => {
        const colorList = editingBackground ? bgColors : colors;
        if (colorList.length === 0) {
            return;
        }

        const currentColor = editingBackground
            ? (widget.backgroundColor ?? '')
            : (widget.color ?? defaultColor);

        let currentIndex = colorList.indexOf(currentColor);
        if (currentIndex === -1) {
            currentIndex = 0;
        }

        const nextIndex = direction > 0
            ? (currentIndex + 1) % colorList.length
            : (currentIndex - 1 + colorList.length) % colorList.length;
        const nextColor = colorList[nextIndex];

        if (editingBackground) {
            onUpdate({
                ...widget,
                backgroundColor: nextColor === '' ? undefined : nextColor
            });
        } else {
            onUpdate({
                ...widget,
                color: nextColor
            });
        }
    };

    // Apply hex color
    const applyHexColor = () => {
        if (hexInput.length === 6) {
            const hexColor = `hex:${hexInput}`;
            if (editingBackground) {
                onUpdate({ ...widget, backgroundColor: hexColor });
            } else {
                onUpdate({ ...widget, color: hexColor });
            }
            setHexInputMode(false);
            setHexInput('');
        }
    };

    // Apply ANSI256 color
    const applyAnsi256Color = () => {
        const code = parseInt(ansi256Input, 10);
        if (!isNaN(code) && code >= 0 && code <= 255) {
            const ansiColor = `ansi256:${code}`;
            if (editingBackground) {
                onUpdate({ ...widget, backgroundColor: ansiColor });
            } else {
                onUpdate({ ...widget, color: ansiColor });
            }
            setAnsi256InputMode(false);
            setAnsi256Input('');
        }
    };

    useInput((input, key) => {
        // Handle hex input mode
        if (hexInputMode) {
            if (key.escape) {
                setHexInputMode(false);
                setHexInput('');
            } else if (key.return) {
                applyHexColor();
            } else if (key.backspace || key.delete) {
                setHexInput(hexInput.slice(0, -1));
            } else if (shouldInsertInput(input, key) && hexInput.length < 6) {
                const upperInput = input.toUpperCase();
                if (/^[0-9A-F]$/.test(upperInput)) {
                    setHexInput(hexInput + upperInput);
                }
            }
            return;
        }

        // Handle ANSI256 input mode
        if (ansi256InputMode) {
            if (key.escape) {
                setAnsi256InputMode(false);
                setAnsi256Input('');
            } else if (key.return) {
                applyAnsi256Color();
            } else if (key.backspace || key.delete) {
                setAnsi256Input(ansi256Input.slice(0, -1));
            } else if (shouldInsertInput(input, key) && ansi256Input.length < 3) {
                if (/^[0-9]$/.test(input)) {
                    const newInput = ansi256Input + input;
                    const code = parseInt(newInput, 10);
                    if (code <= 255) {
                        setAnsi256Input(newInput);
                    }
                }
            }
            return;
        }

        // Normal mode
        if (key.escape) {
            onCancel();
        } else if (input === 'h' && settings.colorLevel === 3) {
            setHexInputMode(true);
            setHexInput('');
        } else if (input === 'a' && settings.colorLevel === 2) {
            setAnsi256InputMode(true);
            setAnsi256Input('');
        } else if (input === 'f') {
            setEditingBackground(!editingBackground);
        } else if (input === 'b') {
            onUpdate({ ...widget, bold: !widget.bold });
        } else if (input === 'r') {
            if (onReset) {
                onReset();
            } else {
                // Default reset: remove color/backgroundColor/bold
                const { color, backgroundColor, bold, ...rest } = widget;
                void color;
                void backgroundColor;
                void bold;
                onUpdate(rest);
            }
        } else if (key.leftArrow || key.rightArrow) {
            cycleColor(key.rightArrow ? 1 : -1);
        }
    });

    // Get current color for display
    const currentColor = editingBackground
        ? (widget.backgroundColor ?? '')
        : (widget.color ?? defaultColor);

    const colorList = editingBackground ? bgColors : colors;
    const colorIndex = colorList.indexOf(currentColor);
    const colorNumber = colorIndex === -1 ? 'custom' : colorIndex + 1;

    // Format color display
    let colorDisplay;
    if (editingBackground) {
        if (!currentColor) {
            colorDisplay = <Text color="gray">(no background)</Text>;
        } else {
            const displayName = currentColor.startsWith('ansi256:')
                ? `ANSI ${currentColor.substring(8)}`
                : currentColor.startsWith('hex:')
                    ? `#${currentColor.substring(4)}`
                    : bgColorOptions.find(c => c.value === currentColor)?.name ?? currentColor;

            const level = getColorLevelString(settings.colorLevel);
            colorDisplay = <Text>{applyColors(` ${displayName} `, undefined, currentColor, false, level)}</Text>;
        }
    } else {
        if (!currentColor) {
            colorDisplay = <Text color="gray">(default)</Text>;
        } else {
            const displayName = currentColor.startsWith('ansi256:')
                ? `ANSI ${currentColor.substring(8)}`
                : currentColor.startsWith('hex:')
                    ? `#${currentColor.substring(4)}`
                    : colorOptions.find(c => c.value === currentColor)?.name ?? currentColor;

            const level = getColorLevelString(settings.colorLevel);
            colorDisplay = <Text>{applyColors(displayName, currentColor, undefined, false, level)}</Text>;
        }
    }

    // Get widget display name
    const widgetName = widgetImpl?.getDisplayName() ?? widget.type;

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
            <Box marginBottom={1}>
                <Text bold>
                    Edit Colors: {widgetName}
                    {editingBackground && <Text color="yellow"> [BACKGROUND]</Text>}
                </Text>
            </Box>

            {hexInputMode ? (
                <Box flexDirection="column">
                    <Text>Enter 6-digit hex color code (without #):</Text>
                    <Text>
                        #
                        {hexInput}
                        <Text dimColor>{hexInput.length < 6 ? '_'.repeat(6 - hexInput.length) : ''}</Text>
                    </Text>
                    <Text dimColor>Press Enter when done, ESC to cancel</Text>
                </Box>
            ) : ansi256InputMode ? (
                <Box flexDirection="column">
                    <Text>Enter ANSI 256 color code (0-255):</Text>
                    <Text>
                        {ansi256Input}
                        <Text dimColor>
                            {ansi256Input.length === 0 ? '___' : ansi256Input.length === 1 ? '__' : ansi256Input.length === 2 ? '_' : ''}
                        </Text>
                    </Text>
                    <Text dimColor>Press Enter when done, ESC to cancel</Text>
                </Box>
            ) : (
                <>
                    <Box marginBottom={1}>
                        <Text>
                            Current {editingBackground ? 'background' : 'foreground'}
                            {' '}
                            ({colorNumber === 'custom' ? 'custom' : `${colorNumber}/${colorList.length}`}):
                            {' '}
                            {colorDisplay}
                            {widget.bold && <Text bold> [BOLD]</Text>}
                        </Text>
                    </Box>

                    <Box>
                        <Text dimColor>
                            ←→ cycle {editingBackground ? 'background' : 'foreground'}, (f) bg/fg, (b)old,
                            {settings.colorLevel === 3 ? ' (h)ex,' : settings.colorLevel === 2 ? ' (a)nsi256,' : ''}
                            {' '}
                            (r)eset, ESC cancel
                        </Text>
                    </Box>
                </>
            )}
        </Box>
    );
};
