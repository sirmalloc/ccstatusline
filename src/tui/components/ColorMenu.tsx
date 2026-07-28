import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useEffect,
    useState
} from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    applyColors,
    getAvailableBackgroundColorsForUI,
    getAvailableColorsForUI
} from '../../utils/colors';
import { getEffectiveThemeColors } from '../../utils/effective-theme-colors';
import { GRADIENT_PRESET_NAMES } from '../../utils/gradient';
import { shouldInsertInput } from '../../utils/input-guards';
import { getWidget } from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';
import {
    WidgetRow,
    getWidgetRowLabel,
    getWidgetRowTags
} from './WidgetRow';
import {
    clearAllWidgetStyling,
    cycleWidgetColor,
    cycleWidgetDim,
    pinWidgetColor,
    resetWidgetStyling,
    setWidgetColor,
    toggleWidgetBold,
    unpinWidgetColor,
    updateWidgetById
} from './color-menu/mutations';

export interface ColorMenuProps {
    widgets: WidgetItem[];
    lineIndex: number;
    settings: Settings;
    onUpdate: (widgets: WidgetItem[]) => void;
    onBack: () => void;
    onTabSwap?: () => void;
    onWidgetHighlight?: (widgetId: string | null) => void;
    initialWidgetId?: string | null;
}

export const ColorMenu: React.FC<ColorMenuProps> = ({ widgets, lineIndex, settings, onUpdate, onBack, onTabSwap, onWidgetHighlight, initialWidgetId }) => {
    const [showSeparators, setShowSeparators] = useState(false);
    const [hexInputMode, setHexInputMode] = useState(false);
    const [hexInput, setHexInput] = useState('');
    const [ansi256InputMode, setAnsi256InputMode] = useState(false);
    const [ansi256Input, setAnsi256Input] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [gradientMode, setGradientMode] = useState(false);
    const [gradientIndex, setGradientIndex] = useState(0);
    const [gradientCustomStep, setGradientCustomStep] = useState<'start' | 'end' | null>(null);
    const [gradientStartHex, setGradientStartHex] = useState('');
    const [gradientHexInput, setGradientHexInput] = useState('');

    const powerlineEnabled = settings.powerline.enabled;
    // What each widget actually renders as under the active theme; empty without one
    const effectiveThemeColors = getEffectiveThemeColors(widgets, settings);

    // Rows keep their position in the full line so a widget carries the same number
    // in both editor modes; filtered-out widgets simply leave a gap.
    const colorableEntries = widgets
        .map((widget, index) => ({
            widget,
            index
        }))
        .filter(({ widget }) => {
            // Include separators only if showSeparators is true
            if (widget.type === 'separator') {
                return showSeparators;
            }
            // Use the widget's supportsColors method
            const widgetInstance = getWidget(widget.type);
            // Include unknown widgets (they might support colors, we just don't know)
            return widgetInstance ? widgetInstance.supportsColors(widget) : true;
        });
    const colorableWidgets = colorableEntries.map(entry => entry.widget);
    const [highlightedItemId, setHighlightedItemId] = useState(() => {
        if (initialWidgetId) {
            const match = colorableWidgets.find(w => w.id === initialWidgetId);
            if (match) {
                return match.id;
            }
        }
        return colorableWidgets[0]?.id ?? null;
    });
    const [editingBackground, setEditingBackground] = useState(false);

    // Keep the highlight on a row that still exists - toggling separators can remove it
    useEffect(() => {
        if (colorableWidgets.length === 0) {
            return;
        }

        if (!colorableWidgets.some(widget => widget.id === highlightedItemId)) {
            setHighlightedItemId(colorableWidgets[0]?.id ?? null);
        }
    }, [colorableWidgets, highlightedItemId]);

    useEffect(() => {
        onWidgetHighlight?.(highlightedItemId);
    }, [highlightedItemId, onWidgetHighlight]);

    const moveHighlight = (direction: 'up' | 'down') => {
        if (colorableWidgets.length === 0) {
            return;
        }

        const currentIndex = colorableWidgets.findIndex(widget => widget.id === highlightedItemId);
        const fromIndex = currentIndex === -1 ? 0 : currentIndex;
        const nextIndex = direction === 'down'
            ? (fromIndex + 1) % colorableWidgets.length
            : (fromIndex - 1 + colorableWidgets.length) % colorableWidgets.length;

        setHighlightedItemId(colorableWidgets[nextIndex]?.id ?? null);
    };

    // Handle keyboard input
    const hasNoItems = colorableWidgets.length === 0;
    const themeActive = settings.powerline.enabled
        && !!settings.powerline.theme
        && settings.powerline.theme !== 'custom';

    // Editing a colour under an active theme pins that channel, so the edit
    // actually overrides the theme instead of being silently ignored.
    const commitColorEdit = (updated: WidgetItem[], widgetId: string, isBackground: boolean) => {
        if (!themeActive) {
            onUpdate(updated);
            return;
        }
        onUpdate(updateWidgetById(updated, widgetId, widget => (
            isBackground
                ? { ...widget, pinBackgroundColor: true }
                : { ...widget, pinColor: true }
        )));
    };

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
                        const newItems = setWidgetColor(widgets, selectedWidget.id, hexColor, editingBackground);
                        commitColorEdit(newItems, selectedWidget.id, editingBackground);
                    }
                    setHexInputMode(false);
                    setHexInput('');
                }
            } else if (key.backspace || key.delete) {
                setHexInput(hexInput.slice(0, -1));
            } else if (shouldInsertInput(input, key) && hexInput.length < 6) {
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
                        const newItems = setWidgetColor(widgets, selectedWidget.id, ansiColor, editingBackground);

                        commitColorEdit(newItems, selectedWidget.id, editingBackground);
                        setAnsi256InputMode(false);
                        setAnsi256Input('');
                    }
                }
            } else if (key.backspace || key.delete) {
                setAnsi256Input(ansi256Input.slice(0, -1));
            } else if (shouldInsertInput(input, key) && ansi256Input.length < 3) {
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

        // Handle gradient selection mode
        if (gradientMode) {
            const exitGradient = () => {
                setGradientMode(false);
                setGradientCustomStep(null);
                setGradientStartHex('');
                setGradientHexInput('');
            };

            const applyGradientValue = (value: string) => {
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    commitColorEdit(setWidgetColor(widgets, selectedWidget.id, value, false), selectedWidget.id, false);
                }
                exitGradient();
            };

            // Custom start/end hex entry
            if (gradientCustomStep) {
                if (key.escape) {
                    setGradientCustomStep(null);
                    setGradientHexInput('');
                } else if (key.return) {
                    if (gradientHexInput.length === 6) {
                        if (gradientCustomStep === 'start') {
                            setGradientStartHex(gradientHexInput);
                            setGradientHexInput('');
                            setGradientCustomStep('end');
                        } else {
                            applyGradientValue(`gradient:${gradientStartHex}-${gradientHexInput}`);
                        }
                    }
                } else if (key.backspace || key.delete) {
                    setGradientHexInput(gradientHexInput.slice(0, -1));
                } else if (shouldInsertInput(input, key) && gradientHexInput.length < 6) {
                    const upperInput = input.toUpperCase();
                    if (/^[0-9A-F]$/.test(upperInput)) {
                        setGradientHexInput(gradientHexInput + upperInput);
                    }
                }
                return;
            }

            // Preset list navigation (last item is the "Custom" entry)
            const total = GRADIENT_PRESET_NAMES.length + 1;
            if (key.escape) {
                exitGradient();
            } else if (key.upArrow) {
                setGradientIndex((gradientIndex - 1 + total) % total);
            } else if (key.downArrow) {
                setGradientIndex((gradientIndex + 1) % total);
            } else if (key.return) {
                if (gradientIndex < GRADIENT_PRESET_NAMES.length) {
                    applyGradientValue(`gradient:${GRADIENT_PRESET_NAMES[gradientIndex]}`);
                } else {
                    setGradientStartHex('');
                    setGradientHexInput('');
                    setGradientCustomStep('start');
                }
            }
            return;
        }

        // Ignore number keys to prevent SelectInput numerical navigation
        if (input && /^[0-9]$/.test(input)) {
            return;
        }

        // Tab to swap to ItemsEditor (always available since all items are colorable)
        if (key.tab && onTabSwap) {
            onTabSwap();
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
        } else if (input === 'g' || input === 'G') {
            // Enter gradient selection mode (foreground only, needs a real color palette)
            if (highlightedItemId && highlightedItemId !== 'back' && !editingBackground && settings.colorLevel >= 2) {
                setGradientMode(true);
                setGradientIndex(0);
                setGradientCustomStep(null);
                setGradientStartHex('');
                setGradientHexInput('');
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
                    const newItems = toggleWidgetBold(widgets, selectedWidget.id);
                    onUpdate(newItems);
                }
            }
        } else if (input === 'd' || input === 'D') {
            if (highlightedItemId && highlightedItemId !== 'back') {
                // Cycle dim for the highlighted item: off -> whole -> parens -> off
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = cycleWidgetDim(widgets, selectedWidget.id);
                    onUpdate(newItems);
                }
            }
        } else if (input === 'r' || input === 'R') {
            if (highlightedItemId && highlightedItemId !== 'back') {
                // Reset all styling (color, background, and bold) for the highlighted item
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = resetWidgetStyling(widgets, selectedWidget.id);
                    onUpdate(newItems);
                }
            }
        } else if (input === 'c' || input === 'C') {
            // Show clear all confirmation
            setShowClearConfirm(true);
        } else if ((input === 'p' || input === 'P') && themeActive) {
            // Pin/unpin the highlighted widget's current channel so its colour
            // overrides (or yields back to) the active theme. Pinning surfaces the
            // widget's existing colour (seeding a default only when it has none).
            if (highlightedItemId && highlightedItemId !== 'back') {
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const isPinned = editingBackground ? selectedWidget.pinBackgroundColor : selectedWidget.pinColor;
                    if (isPinned) {
                        onUpdate(unpinWidgetColor(widgets, selectedWidget.id, editingBackground));
                    } else {
                        const widgetImpl = getWidget(selectedWidget.type);
                        const seedColor = editingBackground
                            ? (selectedWidget.backgroundColor ?? bgColors.find(color => color !== '') ?? 'bgBlack')
                            : (selectedWidget.color ?? widgetImpl?.getDefaultColor() ?? 'white');
                        onUpdate(pinWidgetColor(widgets, selectedWidget.id, editingBackground, seedColor));
                    }
                }
            }
        } else if (key.upArrow || key.downArrow) {
            moveHighlight(key.downArrow ? 'down' : 'up');
        } else if (key.leftArrow || key.rightArrow) {
            // Cycle through colors with arrow keys
            if (highlightedItemId && highlightedItemId !== 'back') {
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = cycleWidgetColor({
                        widgets,
                        widgetId: selectedWidget.id,
                        direction: key.rightArrow ? 'right' : 'left',
                        editingBackground,
                        colors,
                        backgroundColors: bgColors
                    });
                    commitColorEdit(newItems, selectedWidget.id, editingBackground);
                }
            }
        }
    });

    if (hasNoItems) {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text bold>
                        Edit Line
                        {' '}
                        {lineIndex + 1}
                        {' '}
                    </Text>
                    <Text color='cyan'>[COLORS]</Text>
                </Box>
                <Box marginTop={1}><Text dimColor>No colorable widgets in the status line.</Text></Box>
                <Text dimColor>Add a widget first to continue.</Text>
                <Box marginTop={1}><Text>Press any key to go back...</Text></Box>
            </Box>
        );
    }

    // Color list for cycling
    // Get available colors from colors.ts
    const colorOptions = getAvailableColorsForUI();
    const colors = colorOptions.map(c => c.value || '');

    // For background, get background colors
    const bgColorOptions = getAvailableBackgroundColorsForUI();
    const bgColors = bgColorOptions.map(c => c.value || '');

    // Rows are tinted with what actually renders: an unpinned channel shows the theme's
    // colour, not the widget's dormant stored one.
    const menuRows = colorableEntries.map(({ widget, index }) => {
        const { displayText, modifierText } = getWidgetRowLabel(widget);
        const level = getColorLevelString(settings.colorLevel);
        let defaultColor = 'white';
        if (widget.type !== 'separator' && widget.type !== 'flex-separator') {
            const widgetImpl = getWidget(widget.type);
            if (widgetImpl) {
                defaultColor = widgetImpl.getDefaultColor();
            }
        }

        const themeChannels = effectiveThemeColors.get(widget.id);

        return {
            id: widget.id,
            number: index + 1,
            label: applyColors(
                displayText,
                themeChannels?.fg ?? widget.color ?? defaultColor,
                themeChannels?.bg ?? widget.backgroundColor,
                widget.bold,
                level,
                widget.dim
            ),
            modifierText,
            tags: getWidgetRowTags(widgets, index, settings)
        };
    });

    // Get current color for highlighted item
    const selectedWidget = highlightedItemId && highlightedItemId !== 'back'
        ? colorableWidgets.find(widget => widget.id === highlightedItemId)
        : null;
    const storedColor = editingBackground
        ? (selectedWidget?.backgroundColor ?? '')  // Empty string for 'none'
        : (selectedWidget ? (selectedWidget.color ?? (() => {
            if (selectedWidget.type !== 'separator' && selectedWidget.type !== 'flex-separator') {
                const widgetImpl = getWidget(selectedWidget.type);
                return widgetImpl ? widgetImpl.getDefaultColor() : 'white';
            }
            return 'white';
        })()) : 'white');

    // Under a theme an unpinned channel renders the theme's colour, so show that rather
    // than the dormant stored value the user would otherwise think was in effect.
    const selectedThemeChannels = selectedWidget ? effectiveThemeColors.get(selectedWidget.id) : undefined;
    const themeChannelColor = editingBackground ? selectedThemeChannels?.bg : selectedThemeChannels?.fg;
    const themeDrivesChannel = themeChannelColor !== undefined;
    const currentColor = themeChannelColor ?? storedColor;

    const colorList = editingBackground ? bgColors : colors;
    const colorIndex = colorList.indexOf(currentColor);
    const colorNumber = themeDrivesChannel
        ? 'theme'
        : (colorIndex === -1 ? 'custom' : colorIndex + 1);

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
            } else if (currentColor.startsWith('gradient:')) {
                const body = currentColor.substring(9);
                if (GRADIENT_PRESET_NAMES.includes(body.toLowerCase())) {
                    displayName = `Gradient: ${body.toLowerCase()}`;
                } else {
                    displayName = `Gradient: ${body}`;
                }
            } else {
                const colorOption = colorOptions.find(c => c.value === currentColor);
                displayName = colorOption ? colorOption.name : currentColor;
            }

            // Apply the color using our applyColors function with the current colorLevel
            const level = getColorLevelString(settings.colorLevel);
            colorDisplay = applyColors(displayName, currentColor, undefined, false, level);
        }
    }
    const styleIndicators = [
        selectedWidget?.bold ? '[BOLD]' : null,
        selectedWidget?.dim === true ? '[DIM]' : null,
        selectedWidget?.dim === 'parens' ? '[DIM ()]' : null
    ].filter(indicator => indicator !== null).join(' ');

    // Pins only matter under an active theme. When they do, show whether the current
    // channel is pinned, and flag that an unpinned value is dormant (the theme renders,
    // not the value shown above).
    const currentChannelPinned = editingBackground
        ? Boolean(selectedWidget?.pinBackgroundColor)
        : Boolean(selectedWidget?.pinColor);
    const pinIndicator = themeActive
        ? (currentChannelPinned ? chalk.green('[PINNED]') : chalk.gray('[unpinned - theme applies]'))
        : '';

    // Gradient selection mode takes over the whole view
    if (gradientMode) {
        const level = getColorLevelString(settings.colorLevel);
        const widgetName = selectedWidget ? getWidgetRowLabel(selectedWidget).displayText : '';

        if (gradientCustomStep) {
            return (
                <Box flexDirection='column'>
                    <Text bold>
                        Custom Gradient
                        {widgetName ? ` - ${widgetName}` : ''}
                    </Text>
                    <Box marginTop={1} flexDirection='column'>
                        <Text>{gradientCustomStep === 'start' ? 'Enter START hex color (without #):' : 'Enter END hex color (without #):'}</Text>
                        {gradientCustomStep === 'end' && (
                            <Text dimColor>
                                Start: #
                                {gradientStartHex}
                            </Text>
                        )}
                        <Text>
                            #
                            {gradientHexInput}
                            <Text dimColor>{gradientHexInput.length < 6 ? '_'.repeat(6 - gradientHexInput.length) : ''}</Text>
                        </Text>
                        <Text> </Text>
                        <Text dimColor>Press Enter when done, ESC to go back</Text>
                    </Box>
                </Box>
            );
        }

        return (
            <Box flexDirection='column'>
                <Text bold>
                    Select Gradient
                    {widgetName ? ` - ${widgetName}` : ''}
                </Text>
                <Box marginTop={1}>
                    <Text dimColor>↑↓ to select, Enter to apply, ESC to cancel</Text>
                </Box>
                <Box marginTop={1} flexDirection='column'>
                    {GRADIENT_PRESET_NAMES.map((name, idx) => (
                        <Text key={name}>
                            {idx === gradientIndex ? '▶ ' : '  '}
                            {applyColors(name, `gradient:${name}`, undefined, idx === gradientIndex, level)}
                        </Text>
                    ))}
                    <Text key='custom'>
                        {gradientIndex === GRADIENT_PRESET_NAMES.length ? '▶ ' : '  '}
                        Custom (enter two hex stops)
                    </Text>
                </Box>
            </Box>
        );
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
                            const newItems = clearAllWidgetStyling(widgets);
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
                    Edit Line
                    {' '}
                    {lineIndex + 1}
                    {' '}
                </Text>
                <Text color='cyan'>[COLORS]</Text>
                {editingBackground && <Text color='yellow'> [BACKGROUND]</Text>}
                {globalOverrideMessage && (
                    <Text color='yellow' dimColor>
                        {'  '}
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
                        , (f) to toggle bg/fg, (b)old, (d)im,
                        {settings.colorLevel === 3 ? ' (h)ex,' : settings.colorLevel === 2 ? ' (a)nsi256,' : ''}
                        {!editingBackground && settings.colorLevel >= 2 ? ' (g)radient,' : ''}
                        {' '}
                        (r)eset, (c)lear all,
                        {themeActive ? ' (p)in/unpin,' : ''}
                        {!settings.powerline.enabled && !settings.defaultSeparator
                            ? ` (s)how separators: ${showSeparators ? 'ON' : 'OFF'},`
                            : ''}
                        {onTabSwap ? ' ⇥ edit widgets,' : ''}
                        {' '}
                        ESC to go back
                    </Text>
                    {selectedWidget ? (
                        <Box marginTop={1}>
                            <Text>
                                Current
                                {' '}
                                {editingBackground ? 'background' : 'foreground'}
                                {' '}
                                (
                                {colorNumber === 'custom' || colorNumber === 'theme'
                                    ? colorNumber
                                    : `${colorNumber}/${colorList.length}`}
                                ):
                                {' '}
                                {colorDisplay}
                                {styleIndicators && ` ${styleIndicators}`}
                                {pinIndicator && ` ${pinIndicator}`}
                            </Text>
                        </Box>
                    ) : (
                        <Box marginTop={1}>
                            <Text> </Text>
                        </Box>
                    )}
                </>
            )}
            <Box marginTop={1} flexDirection='column'>
                {menuRows.map(row => (
                    <WidgetRow
                        key={row.id}
                        number={row.number}
                        label={row.label}
                        labelIsStyled={true}
                        isSelected={row.id === highlightedItemId}
                        modifierText={row.modifierText}
                        tags={row.tags}
                    />
                ))}
            </Box>
            <Box marginTop={1}>
                <Text dimColor wrap='wrap'>VSCode: if colors look wrong, set `terminal.integrated.minimumContrastRatio` to 1</Text>
            </Box>
        </Box>
    );
};
