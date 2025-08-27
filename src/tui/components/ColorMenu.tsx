import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import SelectInput from 'ink-select-input';
import React, { useState } from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    applyColors,
    getAvailableBackgroundColorsForUI,
    getAvailableColorsForUI
} from '../../utils/colors';
import { getWidget } from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';

export interface ColorMenuProps {
    widgets: WidgetItem[];
    lineIndex?: number;
    settings: Settings;
    onUpdate: (widgets: WidgetItem[]) => void;
    onBack: () => void;
}

export const ColorMenu: React.FC<ColorMenuProps> = ({ widgets, lineIndex, settings, onUpdate, onBack }) => {
    const [showSeparators, setShowSeparators] = useState(false);
    const [hexInputMode, setHexInputMode] = useState(false);
    const [hexInput, setHexInput] = useState('');
    const [ansi256InputMode, setAnsi256InputMode] = useState(false);
    const [ansi256Input, setAnsi256Input] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const powerlineEnabled = settings.powerline.enabled;

    const colorableWidgets = widgets.filter((widget) => {
        // Include separators only if showSeparators is true
        if (widget.type === 'separator') {
            return showSeparators;
        }
        // Use the widget's supportsColors method
        const widgetInstance = getWidget(widget.type);
        // Include unknown widgets (they might support colors, we just don't know)
        return widgetInstance ? widgetInstance.supportsColors(widget) : true;
    });
    const [highlightedItemId, setHighlightedItemId] = useState<string | null>(colorableWidgets[0]?.id ?? null);
    const [editingBackground, setEditingBackground] = useState(false);

    // Handle keyboard input
    const hasNoItems = colorableWidgets.length === 0;
    useInput((input, key) => {
        // If no items, any key goes back
        if (hasNoItems) {
            onBack();
            return;
        }

        // Skip input handling when confirmation is active - let ConfirmDialog handle it
        if (showClearConfirm) {
            return;
        }

        // Handle hex input mode
        if (hexInputMode) {
            // Disable arrow keys in input mode
            if (key.upArrow || key.downArrow) {
                return;
            }
            if (key.escape) {
                setHexInputMode(false);
                setHexInput('');
            } else if (key.return) {
                // Validate and apply the hex color
                if (hexInput.length === 6) {
                    const hexColor = `hex:${hexInput}`;
                    const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                    if (selectedWidget) {
                        // IMPORTANT: Update ALL items (not just colorableWidgets) to maintain proper indexing
                        const newItems = widgets.map((widget) => {
                            if (widget.id === highlightedItemId) {
                                if (editingBackground) {
                                    return { ...widget, backgroundColor: hexColor };
                                } else {
                                    return { ...widget, color: hexColor };
                                }
                            }
                            return widget;
                        });
                        onUpdate(newItems);
                    }
                    setHexInputMode(false);
                    setHexInput('');
                }
            } else if (key.backspace || key.delete) {
                setHexInput(hexInput.slice(0, -1));
            } else if (input && hexInput.length < 6) {
                // Only accept hex characters (0-9, A-F, a-f)
                const upperInput = input.toUpperCase();
                if (/^[0-9A-F]$/.test(upperInput)) {
                    setHexInput(hexInput + upperInput);
                }
            }
            return;
        }

        // Handle ansi256 input mode
        if (ansi256InputMode) {
            // Disable arrow keys in input mode
            if (key.upArrow || key.downArrow) {
                return;
            }
            if (key.escape) {
                setAnsi256InputMode(false);
                setAnsi256Input('');
            } else if (key.return) {
                // Validate and apply the ansi256 color
                const code = parseInt(ansi256Input, 10);
                if (!isNaN(code) && code >= 0 && code <= 255) {
                    const ansiColor = `ansi256:${code}`;

                    const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);

                    if (selectedWidget) {
                        // IMPORTANT: Update ALL items (not just colorableWidgets) to maintain proper indexing
                        const newItems = widgets.map((widget) => {
                            if (widget.id === highlightedItemId) {
                                if (editingBackground) {
                                    return { ...widget, backgroundColor: ansiColor };
                                } else {
                                    return { ...widget, color: ansiColor };
                                }
                            }
                            return widget;
                        });

                        onUpdate(newItems);
                        setAnsi256InputMode(false);
                        setAnsi256Input('');
                    }
                }
            } else if (key.backspace || key.delete) {
                setAnsi256Input(ansi256Input.slice(0, -1));
            } else if (input && ansi256Input.length < 3) {
                // Only accept numeric characters (0-9)
                if (/^[0-9]$/.test(input)) {
                    const newInput = ansi256Input + input;
                    const code = parseInt(newInput, 10);
                    // Only allow if it won't exceed 255
                    if (code <= 255) {
                        setAnsi256Input(newInput);
                    }
                }
            }
            return;
        }

        // Ignore number keys to prevent SelectInput numerical navigation
        if (input && /^[0-9]$/.test(input)) {
            return;
        }

        // Normal keyboard handling when there are items
        if (key.escape) {
            if (editingBackground) {
                setEditingBackground(false);
            } else {
                onBack();
            }
        } else if (input === 'h' || input === 'H') {
            // Enter hex input mode (only in truecolor mode)
            if (highlightedItemId && highlightedItemId !== 'back' && settings.colorLevel === 3) {
                setHexInputMode(true);
                setHexInput('');
            }
        } else if (input === 'a' || input === 'A') {
            // Enter ansi256 input mode (only in 256 color mode)
            if (highlightedItemId && highlightedItemId !== 'back' && settings.colorLevel === 2) {
                setAnsi256InputMode(true);
                setAnsi256Input('');
            }
        } else if ((input === 's' || input === 'S') && !key.ctrl) {
            // Toggle show separators (only if not in powerline mode and no default separator)
            if (!settings.powerline.enabled && !settings.defaultSeparator) {
                setShowSeparators(!showSeparators);
                // The highlighted item ID will be maintained, and we'll recalculate
                // the initial index when rendering the SelectInput
            }
        } else if (input === 'f' || input === 'F') {
            if (colorableWidgets.length > 0) {
                setEditingBackground(!editingBackground);
            }
        } else if (input === 'b' || input === 'B') {
            if (highlightedItemId && highlightedItemId !== 'back') {
                // Toggle bold for the highlighted item
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = widgets.map((widget) => {
                        if (widget.id === selectedWidget.id) {
                            return { ...widget, bold: !widget.bold };
                        }
                        return widget;
                    });
                    onUpdate(newItems);
                }
            }
        } else if (input === 'r' || input === 'R') {
            if (highlightedItemId && highlightedItemId !== 'back') {
                // Reset all styling (color, background, and bold) for the highlighted item
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = widgets.map((widget) => {
                        if (widget.id === selectedWidget.id) {
                            // Remove color, backgroundColor, and bold properties
                            const { color, backgroundColor, bold, ...restWidget } = widget;
                            void color; // Intentionally unused
                            void backgroundColor; // Intentionally unused
                            void bold; // Intentionally unused
                            return restWidget;
                        }
                        return widget;
                    });
                    onUpdate(newItems);
                }
            }
        } else if (input === 'c' || input === 'C') {
            // Show clear all confirmation
            setShowClearConfirm(true);
        } else if (key.leftArrow || key.rightArrow) {
            // Cycle through colors with arrow keys
            if (highlightedItemId && highlightedItemId !== 'back') {
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = widgets.map((widget) => {
                        if (widget.id === selectedWidget.id) {
                            if (editingBackground) {
                                const currentBgColor = widget.backgroundColor ?? '';  // Empty string for 'none'
                                let currentBgColorIndex = bgColors.indexOf(currentBgColor);
                                // If color not found, start from beginning
                                if (currentBgColorIndex === -1)
                                    currentBgColorIndex = 0;

                                let nextBgColorIndex;
                                if (key.rightArrow) {
                                    nextBgColorIndex = (currentBgColorIndex + 1) % bgColors.length;
                                } else {
                                    nextBgColorIndex = currentBgColorIndex === 0 ? bgColors.length - 1 : currentBgColorIndex - 1;
                                }
                                const nextBgColor = bgColors[nextBgColorIndex];
                                return { ...widget, backgroundColor: nextBgColor === '' ? undefined : nextBgColor };
                            } else {
                                let defaultColor = 'white';
                                if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
                                    const widgetImpl = getWidget(widget.type);
                                    if (widgetImpl) {
                                        defaultColor = widgetImpl.getDefaultColor();
                                    }
                                }
                                let currentColor = widget.color ?? defaultColor;
                                // If color is 'dim', treat as if no color was set
                                if (currentColor === 'dim') {
                                    currentColor = defaultColor;
                                }
                                let currentColorIndex = colors.indexOf(currentColor);
                                // If color not found, start from beginning
                                if (currentColorIndex === -1)
                                    currentColorIndex = 0;

                                let nextColorIndex;
                                if (key.rightArrow) {
                                    nextColorIndex = (currentColorIndex + 1) % colors.length;
                                } else {
                                    nextColorIndex = currentColorIndex === 0 ? colors.length - 1 : currentColorIndex - 1;
                                }
                                const nextColor = colors[nextColorIndex];
                                return { ...widget, color: nextColor };
                            }
                        }
                        return widget;
                    });
                    onUpdate(newItems);
                }
            }
        }
    });

    if (hasNoItems) {
        return (
            <Box flexDirection='column'>
                <Text bold>
                    Configure Colors
                    {lineIndex !== undefined ? ` - Line ${lineIndex + 1}` : ''}
                </Text>
                <Box marginTop={1}><Text dimColor>No colorable widgets in the status line.</Text></Box>
                <Text dimColor>Add a widget first to continue.</Text>
                <Box marginTop={1}><Text>Press any key to go back...</Text></Box>
            </Box>
        );
    }

    const getItemLabel = (widget: WidgetItem) => {
        if (widget.type === 'separator') {
            const char = widget.character ?? '|';
            return `Separator: ${char === ' ' ? 'space' : char}`;
        }
        if (widget.type === 'flex-separator') {
            return 'Flex Separator';
        }

        const widgetImpl = getWidget(widget.type);
        return widgetImpl ? widgetImpl.getDisplayName() : `Unknown: ${widget.type}`;
    };

    // Color list for cycling
    // Get available colors from colors.ts
    const colorOptions = getAvailableColorsForUI();
    const colors = colorOptions.map(c => c.value || '');

    // For background, get background colors
    const bgColorOptions = getAvailableBackgroundColorsForUI();
    const bgColors = bgColorOptions.map(c => c.value || '');

    // Create menu items with colored labels
    const menuItems = colorableWidgets.map((widget, index) => {
        const label = `${index + 1}: ${getItemLabel(widget)}`;
        // Apply both foreground and background colors
        const level = getColorLevelString(settings.colorLevel);
        let defaultColor = 'white';
        if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
            const widgetImpl = getWidget(widget.type);
            if (widgetImpl) {
                defaultColor = widgetImpl.getDefaultColor();
            }
        }
        const styledLabel = applyColors(label, widget.color ?? defaultColor, widget.backgroundColor, widget.bold, level);
        return {
            label: styledLabel,
            value: widget.id
        };
    });
    menuItems.push({ label: '← Back', value: 'back' });

    const handleSelect = (selected: { value: string }) => {
        if (selected.value === 'back') {
            onBack();
        }
        // Enter no longer cycles colors - use left/right arrow keys instead
    };

    const handleHighlight = (item: { value: string }) => {
        setHighlightedItemId(item.value);
    };

    // Get current color for highlighted item
    const selectedWidget = highlightedItemId && highlightedItemId !== 'back'
        ? colorableWidgets.find(widget => widget.id === highlightedItemId)
        : null;
    const currentColor = editingBackground
        ? (selectedWidget?.backgroundColor ?? '')  // Empty string for 'none'
        : (selectedWidget ? (selectedWidget.color ?? (() => {
            if (selectedWidget.type !== 'separator' && selectedWidget.type !== 'flex-separator') {
                const widgetImpl = getWidget(selectedWidget.type);
                return widgetImpl ? widgetImpl.getDefaultColor() : 'white';
            }
            return 'white';
        })()) : 'white');

    const colorList = editingBackground ? bgColors : colors;
    const colorIndex = colorList.indexOf(currentColor);
    const colorNumber = colorIndex === -1 ? 'custom' : colorIndex + 1;

    let colorDisplay;
    if (editingBackground) {
        if (!currentColor || currentColor === '') {
            colorDisplay = chalk.gray('(no background)');
        } else {
            // Determine display name based on format
            let displayName;
            if (currentColor.startsWith('ansi256:')) {
                displayName = `ANSI ${currentColor.substring(8)}`;
            } else if (currentColor.startsWith('hex:')) {
                displayName = `#${currentColor.substring(4)}`;
            } else {
                const colorOption = bgColorOptions.find(c => c.value === currentColor);
                displayName = colorOption ? colorOption.name : currentColor;
            }

            // Apply the color using our applyColors function with the current colorLevel
            const level = getColorLevelString(settings.colorLevel);
            colorDisplay = applyColors(` ${displayName} `, undefined, currentColor, false, level);
        }
    } else {
        if (!currentColor || currentColor === '') {
            colorDisplay = chalk.gray('(default)');
        } else {
            // Determine display name based on format
            let displayName;
            if (currentColor.startsWith('ansi256:')) {
                displayName = `ANSI ${currentColor.substring(8)}`;
            } else if (currentColor.startsWith('hex:')) {
                displayName = `#${currentColor.substring(4)}`;
            } else {
                const colorOption = colorOptions.find(c => c.value === currentColor);
                displayName = colorOption ? colorOption.name : currentColor;
            }

            // Apply the color using our applyColors function with the current colorLevel
            const level = getColorLevelString(settings.colorLevel);
            colorDisplay = applyColors(displayName, currentColor, undefined, false, level);
        }
    }

    // Show confirmation dialog if clearing all colors
    if (showClearConfirm) {
        return (
            <Box flexDirection='column'>
                <Text bold color='yellow'>⚠ Confirm Clear All Colors</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text>This will reset all colors for all widgets to their defaults.</Text>
                    <Text color='red'>This action cannot be undone!</Text>
                </Box>
                <Box marginTop={2}>
                    <Text>Continue?</Text>
                </Box>
                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            // Clear all colors from all widgets
                            const newItems = widgets.map((widget) => {
                                // Remove color, backgroundColor, and bold properties
                                const { color, backgroundColor, bold, ...restWidget } = widget;
                                void color; // Intentionally unused
                                void backgroundColor; // Intentionally unused
                                void bold; // Intentionally unused
                                return restWidget;
                            });
                            onUpdate(newItems);
                            setShowClearConfirm(false);
                        }}
                        onCancel={() => {
                            setShowClearConfirm(false);
                        }}
                    />
                </Box>
            </Box>
        );
    }

    // Check for global overrides
    // Note: When powerline is enabled, background override doesn't affect the display
    // since powerline uses item-specific backgrounds for segments
    const hasGlobalFgOverride = !!settings.overrideForegroundColor;
    const hasGlobalBgOverride = !!settings.overrideBackgroundColor && !powerlineEnabled;
    const globalOverrideMessage = hasGlobalFgOverride && hasGlobalBgOverride
        ? '⚠ Global override for FG and BG active'
        : hasGlobalFgOverride
            ? '⚠ Global override for FG active'
            : hasGlobalBgOverride
                ? '⚠ Global override for BG active'
                : null;

    return (
        <Box flexDirection='column'>
            <Box>
                <Text bold>
                    Configure Colors
                    {lineIndex !== undefined ? ` - Line ${lineIndex + 1}` : ''}
                    {editingBackground && chalk.yellow(' [Background Mode]')}
                </Text>
                {globalOverrideMessage && (
                    <Text color='yellow' dimColor>
                        {'.  '}
                        {globalOverrideMessage}
                    </Text>
                )}
            </Box>
            {hexInputMode ? (
                <Box flexDirection='column'>
                    <Text>Enter 6-digit hex color code (without #):</Text>
                    <Text>
                        #
                        {hexInput}
                        <Text dimColor>{hexInput.length < 6 ? '_'.repeat(6 - hexInput.length) : ''}</Text>
                    </Text>
                    <Text> </Text>
                    <Text dimColor>Press Enter when done, ESC to cancel</Text>
                </Box>
            ) : ansi256InputMode ? (
                <Box flexDirection='column'>
                    <Text>Enter ANSI 256 color code (0-255):</Text>
                    <Text>
                        {ansi256Input}
                        <Text dimColor>{ansi256Input.length === 0 ? '___' : ansi256Input.length === 1 ? '__' : ansi256Input.length === 2 ? '_' : ''}</Text>
                    </Text>
                    <Text> </Text>
                    <Text dimColor>Press Enter when done, ESC to cancel</Text>
                </Box>
            ) : (
                <>
                    <Text dimColor>
                        ↑↓ to select, ←→ to cycle
                        {' '}
                        {editingBackground ? 'background' : 'foreground'}
                        , (f) to toggle bg/fg, (b)old,
                        {settings.colorLevel === 3 ? ' (h)ex,' : settings.colorLevel === 2 ? ' (a)nsi256,' : ''}
                        {' '}
                        (r)eset, (c)lear all, ESC to go back
                    </Text>
                    {!settings.powerline.enabled && !settings.defaultSeparator && (
                        <Text dimColor>
                            (s)how separators:
                            {showSeparators ? chalk.green('ON') : chalk.gray('OFF')}
                        </Text>
                    )}
                    {selectedWidget ? (
                        <Box marginTop={1}>
                            <Text>
                                Current
                                {' '}
                                {editingBackground ? 'background' : 'foreground'}
                                {' '}
                                (
                                {colorNumber === 'custom' ? 'custom' : `${colorNumber}/${colorList.length}`}
                                ):
                                {' '}
                                {colorDisplay}
                                {selectedWidget.bold && chalk.bold(' [BOLD]')}
                            </Text>
                        </Box>
                    ) : (
                        <Box marginTop={1}>
                            <Text> </Text>
                        </Box>
                    )}
                </>
            )}
            <Box marginTop={1}>
                {(hexInputMode || ansi256InputMode) ? (
                    // Static list when in input mode - no keyboard interaction
                    <Box flexDirection='column'>
                        {menuItems.map(item => (
                            <Text
                                key={item.value}
                                color={item.value === highlightedItemId ? 'cyan' : 'white'}
                                bold={item.value === highlightedItemId}
                            >
                                {item.value === highlightedItemId ? '▶ ' : '  '}
                                {item.label}
                            </Text>
                        ))}
                    </Box>
                ) : (
                    // Interactive SelectInput when not in input mode
                    <SelectInput
                        key={`${showSeparators}-${highlightedItemId}`}
                        items={menuItems}
                        onSelect={handleSelect}
                        onHighlight={handleHighlight}
                        initialIndex={Math.max(0, menuItems.findIndex(item => item.value === highlightedItemId))}
                        indicatorComponent={({ isSelected }) => (
                            <Text>{isSelected ? '▶' : '  '}</Text>
                        )}
                        itemComponent={({ isSelected, label }) => (
                            // The label already has ANSI codes applied via applyColors()
                            // We need to pass it directly as a single Text child to preserve the codes
                            <Text>{` ${label}`}</Text>
                        )}
                    />
                )}
            </Box>
            <Box marginTop={1} flexDirection='column'>
                <Text color='yellow'>⚠ VSCode Users: </Text>
                <Text dimColor wrap='wrap'>If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.</Text>
            </Box>
        </Box>
    );
};