import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useEffect,
    useMemo,
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
import {
    getEffectiveThemeColors,
    isPowerlineThemeActive,
    keepsOwnForeground,
    type ThemeSlotContext
} from '../../utils/effective-theme-colors';
import { GRADIENT_PRESET_NAMES } from '../../utils/gradient';
import { shouldInsertInput } from '../../utils/input-guards';
import { getWidget } from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';
import {
    WidgetRow,
    getWidgetRowLabel,
    getWidgetRowTags,
    styleWidgetRowLabel
} from './WidgetRow';
import {
    clearAllWidgetStyling,
    cycleWidgetColor,
    cycleWidgetDim,
    pinWidgetColor,
    resetWidgetStyling,
    setWidgetColor,
    toggleWidgetBold,
    unpinWidgetColor
} from './color-menu/mutations';

export interface ColorMenuProps {
    widgets: WidgetItem[];
    lineIndex: number;
    settings: Settings;
    /** This line's rendered content and theme-slot offset, so previewed colors match. */
    themeSlotContext: ThemeSlotContext;
    /**
     * Which channel is being edited, and whether separator rows are listed. Both are owned by
     * the caller because Tab swaps editors by changing screen, which unmounts this component -
     * as local state they silently reset, so the header could read [FOREGROUND] while the user
     * believed they were still editing a background.
     */
    editingBackground: boolean;
    onEditingBackgroundChange: (editingBackground: boolean) => void;
    showSeparators: boolean;
    onShowSeparatorsChange: (showSeparators: boolean) => void;
    onUpdate: (widgets: WidgetItem[]) => void;
    onBack: () => void;
    onTabSwap?: () => void;
    onWidgetHighlight?: (widgetId: string | null) => void;
    initialWidgetId?: string | null;
}

export const ColorMenu: React.FC<ColorMenuProps> = ({ widgets, lineIndex, settings, themeSlotContext, editingBackground, onEditingBackgroundChange, showSeparators, onShowSeparatorsChange, onUpdate, onBack, onTabSwap, onWidgetHighlight, initialWidgetId }) => {
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
    // What each widget actually renders as under the active theme; empty without one.
    // Memoised because it runs on every keystroke otherwise, and because the derived row
    // lists below feed effect dependencies - a fresh array each render re-runs them for nothing.
    const effectiveThemeColors = useMemo(
        () => getEffectiveThemeColors(widgets, settings, themeSlotContext),
        [widgets, settings, themeSlotContext]
    );

    // Rows keep their position in the full line so a widget carries the same number
    // in both editor modes; filtered-out widgets simply leave a gap.
    const colorableEntries = useMemo(() => widgets
        .map((widget, index) => ({
            widget,
            index
        }))
        .filter(({ widget }) => {
            // Include separators only if showSeparators is true
            if (widget.type === 'separator') {
                return showSeparators;
            }
            // A flex separator is pure spacing - it renders no text of its own and takes no
            // theme slot, so there is nothing to colour. getWidget returns null for it, which
            // would otherwise land it in the unknown-widget branch below.
            if (widget.type === 'flex-separator') {
                return false;
            }
            // Use the widget's supportsColors method
            const widgetInstance = getWidget(widget.type);
            // Include unknown widgets (they might support colors, we just don't know)
            return widgetInstance ? widgetInstance.supportsColors(widget) : true;
        }), [widgets, showSeparators]);
    const colorableWidgets = useMemo(() => colorableEntries.map(entry => entry.widget), [colorableEntries]);
    const [highlightedItemId, setHighlightedItemId] = useState(() => {
        if (initialWidgetId) {
            const match = colorableWidgets.find(w => w.id === initialWidgetId);
            if (match) {
                return match.id;
            }
        }
        return colorableWidgets[0]?.id ?? null;
    });

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
    const themeActive = isPowerlineThemeActive(settings);
    // Stale pins survive a theme being turned off, so the unpin hint has to survive with them
    const hasAnyPins = widgets.some(widget => Boolean(widget.pinColor) || Boolean(widget.pinBackgroundColor));

    const isChannelPinned = (widget: WidgetItem): boolean => (
        editingBackground ? Boolean(widget.pinBackgroundColor) : Boolean(widget.pinColor)
    );

    /**
     * Is the theme the thing painting this channel right now? Pinning is not the only way a
     * widget keeps a channel for itself, so this defers to keepsOwnForeground rather than
     * reading the pin flag directly - the renderer decides the same way, from the same
     * predicate. The other case it covers, a custom command with preserveColors, cannot
     * reach this list today because supportsColors is false while that option is set; the
     * rule is stated once anyway so the two sides cannot drift apart if that changes.
     */
    const isChannelThemeDriven = (widget: WidgetItem): boolean => {
        if (!themeActive) {
            return false;
        }

        return editingBackground ? !widget.pinBackgroundColor : !keepsOwnForeground(widget);
    };

    /**
     * Under a theme, a channel must be pinned before its colour can be edited. Editing an
     * unpinned channel would overwrite a colour the theme is currently hiding - which is
     * the very value the no-appearance-change guarantee promises to leave alone - and a
     * stray arrow key sits one row from the navigation keys.
     */
    const canEditColor = (widget: WidgetItem): boolean => !isChannelThemeDriven(widget);

    /** The widget a colour edit applies to, or null when the channel is not editable yet. */
    const getEditableWidget = (): WidgetItem | null => {
        if (!highlightedItemId) {
            return null;
        }

        const widget = colorableWidgets.find(entry => entry.id === highlightedItemId);
        return widget && canEditColor(widget) ? widget : null;
    };

    useInput((input, key) => {
        // Tab is checked before the empty-state bail: with nothing colourable on the line, the
        // widget editor is where you go to add something, and it is the screen this Tab reaches.
        // Swallowing Tab here sent the user to the line selector instead, contradicting the
        // "Add a widget first to continue" message on screen.
        if (key.tab && onTabSwap) {
            onTabSwap();
            return;
        }

        // If no items, any other key goes back
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
                        onUpdate(newItems);
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

                        onUpdate(newItems);
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
                    onUpdate(setWidgetColor(widgets, selectedWidget.id, value, false));
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

        // Normal keyboard handling when there are items
        if (key.escape) {
            if (editingBackground) {
                onEditingBackgroundChange(false);
            } else {
                onBack();
            }
        } else if (input === 'h' || input === 'H') {
            // Enter hex input mode (only in truecolor mode)
            if (getEditableWidget() && settings.colorLevel === 3) {
                setHexInputMode(true);
                setHexInput('');
            }
        } else if (input === 'a' || input === 'A') {
            // Enter ansi256 input mode (only in 256 color mode)
            if (getEditableWidget() && settings.colorLevel === 2) {
                setAnsi256InputMode(true);
                setAnsi256Input('');
            }
        } else if (input === 'g' || input === 'G') {
            // Enter gradient selection mode (foreground only, needs a real color palette)
            if (getEditableWidget() && !editingBackground && settings.colorLevel >= 2) {
                setGradientMode(true);
                setGradientIndex(0);
                setGradientCustomStep(null);
                setGradientStartHex('');
                setGradientHexInput('');
            }
        } else if ((input === 's' || input === 'S') && !key.ctrl) {
            // Toggle show separators (only if not in powerline mode and no default separator)
            if (!settings.powerline.enabled && !settings.defaultSeparator) {
                // The highlight is keyed by widget id, so it survives rows appearing and
                // disappearing; the effect below repairs it if the highlighted row goes away.
                onShowSeparatorsChange(!showSeparators);
            }
        } else if (input === 'f' || input === 'F') {
            if (colorableWidgets.length > 0) {
                onEditingBackgroundChange(!editingBackground);
            }
        } else if (input === 'b' || input === 'B') {
            if (highlightedItemId) {
                // Toggle bold for the highlighted item
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = toggleWidgetBold(widgets, selectedWidget.id);
                    onUpdate(newItems);
                }
            }
        } else if (input === 'd' || input === 'D') {
            if (highlightedItemId) {
                // Cycle dim for the highlighted item: off -> whole -> parens -> off
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = cycleWidgetDim(widgets, selectedWidget.id);
                    onUpdate(newItems);
                }
            }
        } else if (input === 'r' || input === 'R') {
            if (highlightedItemId) {
                // Reset all styling (color, background, and bold) for the highlighted item
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    const newItems = resetWidgetStyling(widgets, selectedWidget.id, themeActive);
                    onUpdate(newItems);
                }
            }
        } else if (input === 'c' || input === 'C') {
            // Show clear all confirmation
            setShowClearConfirm(true);
        } else if (input === 'p' || input === 'P') {
            // Pin/unpin the highlighted widget's current channel so its colour
            // overrides (or yields back to) the active theme. Pinning surfaces the
            // widget's existing colour, falling back to the theme colour it is showing
            // right now.
            //
            // Unpinning works with no theme active, even though pinning does not: a pin left
            // behind by a theme that has since been turned off still renders that theme's
            // colour and comes back to life the moment any theme is enabled, so there has to
            // be a way to clear it without hand-editing settings.json.
            if (highlightedItemId) {
                const selectedWidget = colorableWidgets.find(widget => widget.id === highlightedItemId);
                if (selectedWidget) {
                    if (isChannelPinned(selectedWidget)) {
                        onUpdate(unpinWidgetColor(widgets, selectedWidget.id, editingBackground));
                    } else if (themeActive) {
                        const widgetImpl = getWidget(selectedWidget.type);
                        const themeChannels = effectiveThemeColors.get(selectedWidget.id);
                        const seedColor = editingBackground
                            ? (selectedWidget.backgroundColor ?? themeChannels?.bg ?? bgColors.find(color => color !== '') ?? 'bgBlack')
                            : (selectedWidget.color ?? themeChannels?.fg ?? widgetImpl?.getDefaultColor() ?? 'white');
                        onUpdate(pinWidgetColor(widgets, selectedWidget.id, editingBackground, seedColor));
                    }
                }
            }
        } else if (key.upArrow || key.downArrow) {
            moveHighlight(key.downArrow ? 'down' : 'up');
        } else if (key.leftArrow || key.rightArrow) {
            // Cycle through colors with arrow keys
            const selectedWidget = getEditableWidget();
            if (selectedWidget) {
                const newItems = cycleWidgetColor({
                    widgets,
                    widgetId: selectedWidget.id,
                    direction: key.rightArrow ? 'right' : 'left',
                    editingBackground,
                    colors,
                    backgroundColors: bgColors
                });
                onUpdate(newItems);
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

        return {
            id: widget.id,
            number: index + 1,
            label: styleWidgetRowLabel(displayText, widget, settings, effectiveThemeColors.get(widget.id)),
            modifierText,
            tags: getWidgetRowTags(widgets, index, settings)
        };
    });

    // Get current color for highlighted item
    const selectedWidget = highlightedItemId
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
    // The theme owns this channel until the user takes it over, so say how rather than
    // leaving the colour keys looking broken.
    const overrideHint = selectedWidget && isChannelThemeDriven(selectedWidget)
        ? '- theme applies, press (p) to override'
        : '';
    const styleIndicators = [
        selectedWidget?.bold ? '[BOLD]' : null,
        selectedWidget?.dim === true ? '[DIM]' : null,
        selectedWidget?.dim === 'parens' ? '[DIM ()]' : null
    ].filter(indicator => indicator !== null).join(' ');

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
                    {themeActive ? (
                        <Text>This will clear bold, dim and every pinned color on this line. Colors the theme is hiding are left alone.</Text>
                    ) : (
                        <Text>This will reset all colors for all widgets to their defaults.</Text>
                    )}
                    <Text color='red'>This action cannot be undone!</Text>
                </Box>
                <Box marginTop={2}>
                    <Text>Continue?</Text>
                </Box>
                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            const newItems = clearAllWidgetStyling(widgets, themeActive);
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
                <Text color='yellow'>{editingBackground ? ' [BACKGROUND]' : ' [FOREGROUND]'}</Text>
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
                        ↑↓ to select, ←→ to cycle color, (f) to toggle bg/fg, (b)old, (d)im,
                        {settings.colorLevel === 3 ? ' (h)ex,' : settings.colorLevel === 2 ? ' (a)nsi256,' : ''}
                        {!editingBackground && settings.colorLevel >= 2 ? ' (g)radient,' : ''}
                        {' '}
                        (r)eset, (c)lear all,
                        {themeActive ? ' (p)in/unpin,' : (hasAnyPins ? ' (p) unpin,' : '')}
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
                                Current (
                                {colorNumber === 'custom' || colorNumber === 'theme'
                                    ? colorNumber
                                    : `${colorNumber}/${colorList.length}`}
                                ):
                                {' '}
                                {colorDisplay}
                                {styleIndicators && ` ${styleIndicators}`}
                                {overrideHint && chalk.gray(`  ${overrideHint}`)}
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
