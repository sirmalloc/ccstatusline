import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetItem,
    WidgetItemType
} from '../../types/Widget';
import {
    applyColors,
    getBackgroundColorsForPowerline
} from '../../utils/colors';
import { generateGuid } from '../../utils/guid';
import { canDetectTerminalWidth } from '../../utils/terminal';
import {
    filterWidgetCatalog,
    getMatchSegments,
    getWidget,
    getWidgetCatalog,
    getWidgetCatalogCategories
} from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';
import { RulesEditor } from './RulesEditor';
import {
    getCurrentColorInfo,
    handleColorInput,
    type ColorEditorState
} from './color-editor/input-handlers';
import {
    handleMoveInputMode,
    handleNormalInputMode,
    handlePickerInputMode,
    normalizePickerState,
    type CustomEditorWidgetState,
    type WidgetPickerAction,
    type WidgetPickerState
} from './items-editor/input-handlers';

export interface ItemsEditorProps {
    widgets: WidgetItem[];
    onUpdate: (widgets: WidgetItem[]) => void;
    onBack: () => void;
    lineNumber: number;
    settings: Settings;
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({ widgets, onUpdate, onBack, lineNumber, settings }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [moveMode, setMoveMode] = useState(false);
    const [customEditorWidget, setCustomEditorWidget] = useState<CustomEditorWidgetState | null>(null);
    const [widgetPicker, setWidgetPicker] = useState<WidgetPickerState | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [rulesEditorWidget, setRulesEditorWidget] = useState<WidgetItem | null>(null);
    const [editorMode, setEditorMode] = useState<'items' | 'color'>('items');
    const [colorEditorState, setColorEditorState] = useState<ColorEditorState>({
        editingBackground: false,
        hexInputMode: false,
        hexInput: '',
        ansi256InputMode: false,
        ansi256Input: ''
    });
    const separatorChars = ['|', '-', ',', ' '];

    const widgetCatalog = getWidgetCatalog(settings);
    const widgetCategories = ['All', ...getWidgetCatalogCategories(widgetCatalog)];

    // Get a unique background color for powerline mode
    const getUniqueBackgroundColor = (insertIndex: number): string | undefined => {
        // Only apply background colors if powerline is enabled and NOT using custom theme
        if (!settings.powerline.enabled || settings.powerline.theme === 'custom') {
            return undefined;
        }

        // Get all available background colors (excluding black for better visibility)
        const bgColors = getBackgroundColorsForPowerline();

        // Get colors of adjacent items
        const prevWidget = insertIndex > 0 ? widgets[insertIndex - 1] : null;
        const nextWidget = insertIndex < widgets.length ? widgets[insertIndex] : null;

        const prevBg = prevWidget?.backgroundColor;
        const nextBg = nextWidget?.backgroundColor;

        // Filter out colors that match neighbors
        const availableColors = bgColors.filter(color => color !== prevBg && color !== nextBg);

        // If we have available colors, pick one randomly
        if (availableColors.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableColors.length);
            return availableColors[randomIndex];
        }

        // Fallback: if somehow both neighbors use all 14 colors (impossible with 2 neighbors),
        // just pick any color that's different from the previous
        return bgColors.find(c => c !== prevBg) ?? bgColors[0];
    };

    const handleEditorComplete = (updatedWidget: WidgetItem) => {
        const newWidgets = [...widgets];
        newWidgets[selectedIndex] = updatedWidget;
        onUpdate(newWidgets);
        setCustomEditorWidget(null);
    };

    const handleEditorCancel = () => {
        setCustomEditorWidget(null);
    };

    const getCustomKeybindsForWidget = (widgetImpl: Widget, widget: WidgetItem): CustomKeybind[] => {
        if (!widgetImpl.getCustomKeybinds) {
            return [];
        }

        return widgetImpl.getCustomKeybinds(widget);
    };

    const openWidgetPicker = (action: WidgetPickerAction) => {
        if (widgetCatalog.length === 0) {
            return;
        }

        const currentType = widgets[selectedIndex]?.type;
        const selectedType = action === 'change' ? currentType ?? null : null;

        setWidgetPicker(normalizePickerState({
            action,
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: '',
            widgetQuery: '',
            selectedType
        }, widgetCatalog, widgetCategories));
    };

    const applyWidgetPickerSelection = (selectedType: WidgetItemType) => {
        if (!widgetPicker) {
            return;
        }

        if (widgetPicker.action === 'change') {
            const currentWidget = widgets[selectedIndex];
            if (currentWidget) {
                const newWidgets = [...widgets];
                newWidgets[selectedIndex] = { ...currentWidget, type: selectedType };
                onUpdate(newWidgets);
            }
        } else {
            const insertIndex = widgetPicker.action === 'add'
                ? (widgets.length > 0 ? selectedIndex + 1 : 0)
                : selectedIndex;
            const backgroundColor = getUniqueBackgroundColor(insertIndex);
            const newWidget: WidgetItem = {
                id: generateGuid(),
                type: selectedType,
                ...(backgroundColor && { backgroundColor })
            };
            const newWidgets = [...widgets];
            newWidgets.splice(insertIndex, 0, newWidget);
            onUpdate(newWidgets);
            setSelectedIndex(insertIndex);
        }

        setWidgetPicker(null);
    };

    useInput((input, key) => {
        // Skip input if custom editor is active
        if (customEditorWidget) {
            return;
        }

        // Skip input if rules editor is active
        if (rulesEditorWidget) {
            return;
        }

        // Skip input handling when clear confirmation is active - let ConfirmDialog handle it
        if (showClearConfirm) {
            return;
        }

        // Tab toggles between items and color mode — always consumed here, never falls through
        // Only when: widgets exist, no overlay active (picker, move mode, custom editor, rules editor, clear confirm)
        if (key.tab && widgets.length > 0 && !widgetPicker && !moveMode) {
            const widget = widgets[selectedIndex];
            if (widget) {
                const widgetImpl = widget.type !== 'separator' && widget.type !== 'flex-separator'
                    ? getWidget(widget.type)
                    : null;
                if (widgetImpl?.supportsColors(widget)) {
                    if (editorMode === 'color') {
                        // Reset hex/ansi256 input modes when switching back to items mode
                        if (colorEditorState.hexInputMode || colorEditorState.ansi256InputMode) {
                            setColorEditorState(prev => ({
                                ...prev,
                                hexInputMode: false,
                                hexInput: '',
                                ansi256InputMode: false,
                                ansi256Input: ''
                            }));
                        }
                        setEditorMode('items');
                    } else {
                        setEditorMode('color');
                    }
                }
            }
            return;
        }

        // Auto-reset color mode if the current widget no longer supports colors
        // (e.g. user navigated to a different widget while in color mode)
        if (editorMode === 'color') {
            const widget = widgets[selectedIndex];
            const widgetImpl = widget && widget.type !== 'separator' && widget.type !== 'flex-separator'
                ? getWidget(widget.type)
                : null;
            const supportsColors = widget !== undefined && (widgetImpl?.supportsColors(widget) ?? false);
            if (!supportsColors) {
                setEditorMode('items');
                setColorEditorState(prev => ({
                    ...prev,
                    editingBackground: false,
                    hexInputMode: false,
                    hexInput: '',
                    ansi256InputMode: false,
                    ansi256Input: ''
                }));
            }
        }

        // Color mode input routing
        if (editorMode === 'color') {
            const widget = widgets[selectedIndex];
            if (widget) {
                // Up/Down for navigation (same as items mode)
                if (key.upArrow) {
                    setSelectedIndex(Math.max(0, selectedIndex - 1));
                    return;
                }
                if (key.downArrow) {
                    setSelectedIndex(Math.min(widgets.length - 1, selectedIndex + 1));
                    return;
                }

                // ESC with no sub-mode active: switch back to items mode.
                // If a sub-mode is active, fall through to handleColorInput which handles ESC internally.
                if (key.escape && !colorEditorState.hexInputMode && !colorEditorState.ansi256InputMode) {
                    setEditorMode('items');
                    return;
                }

                const updateWidget = (updatedWidget: WidgetItem) => {
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = updatedWidget;
                    onUpdate(newWidgets);
                };

                // Delegate all input (including ESC in sub-modes) to handleColorInput
                handleColorInput({
                    input,
                    key,
                    widget,
                    settings,
                    state: colorEditorState,
                    setState: setColorEditorState,
                    onUpdate: updateWidget
                });
            }
            // Return unconditionally to prevent fall-through even when widget is undefined
            // (shouldn't happen since Tab guards widgets.length > 0, but is defensive)
            return;
        }

        if (widgetPicker) {
            handlePickerInputMode({
                input,
                key,
                widgetPicker,
                widgetCatalog,
                widgetCategories,
                setWidgetPicker,
                applyWidgetPickerSelection
            });
            return;
        }

        if (moveMode) {
            handleMoveInputMode({
                key,
                widgets,
                selectedIndex,
                onUpdate,
                setSelectedIndex,
                setMoveMode
            });
            return;
        }

        handleNormalInputMode({
            input,
            key,
            widgets,
            selectedIndex,
            separatorChars,
            onBack,
            onUpdate,
            setSelectedIndex,
            setMoveMode,
            setShowClearConfirm,
            openWidgetPicker,
            getCustomKeybindsForWidget,
            setCustomEditorWidget,
            setRulesEditorWidget
        });
    });

    const getWidgetDisplay = (widget: WidgetItem) => {
        // Special handling for separators (not widgets)
        if (widget.type === 'separator') {
            const char = widget.character ?? '|';
            const charDisplay = char === ' ' ? '(space)' : char;
            return `Separator ${charDisplay}`;
        }
        if (widget.type === 'flex-separator') {
            return 'Flex Separator';
        }

        // Handle regular widgets - delegate to widget for display
        const widgetImpl = getWidget(widget.type);
        if (widgetImpl) {
            const { displayText, modifierText } = widgetImpl.getEditorDisplay(widget);
            // Return plain text without colors
            return displayText + (modifierText ? ` ${modifierText}` : '');
        }
        // Unknown widget type
        return `Unknown: ${widget.type}`;
    };

    const hasFlexSeparator = widgets.some(widget => widget.type === 'flex-separator');
    const widthDetectionAvailable = canDetectTerminalWidth();
    const pickerCategories = widgetPicker
        ? [...widgetCategories]
        : [];
    const selectedPickerCategory = widgetPicker
        ? (widgetPicker.selectedCategory && pickerCategories.includes(widgetPicker.selectedCategory)
            ? widgetPicker.selectedCategory
            : (pickerCategories[0] ?? null))
        : null;
    const topLevelSearchEntries = widgetPicker?.level === 'category' && widgetPicker.categoryQuery.trim().length > 0
        ? filterWidgetCatalog(widgetCatalog, 'All', widgetPicker.categoryQuery)
        : [];
    const selectedTopLevelSearchEntry = widgetPicker
        ? (topLevelSearchEntries.find(entry => entry.type === widgetPicker.selectedType) ?? topLevelSearchEntries[0])
        : null;
    const pickerEntries = widgetPicker
        ? filterWidgetCatalog(widgetCatalog, selectedPickerCategory ?? 'All', widgetPicker.widgetQuery)
        : [];
    const selectedPickerEntry = widgetPicker
        ? (pickerEntries.find(entry => entry.type === widgetPicker.selectedType) ?? pickerEntries[0])
        : null;

    // Build dynamic help text based on selected item
    const currentWidget = widgets[selectedIndex];
    const isSeparator = currentWidget?.type === 'separator';
    const isFlexSeparator = currentWidget?.type === 'flex-separator';

    // Check if widget supports raw value using registry
    let canToggleRaw = false;
    let customKeybinds: CustomKeybind[] = [];
    if (currentWidget && !isSeparator && !isFlexSeparator) {
        const widgetImpl = getWidget(currentWidget.type);
        if (widgetImpl) {
            canToggleRaw = widgetImpl.supportsRawValue();
            // Get custom keybinds from the widget
            customKeybinds = getCustomKeybindsForWidget(widgetImpl, currentWidget);
        } else {
            canToggleRaw = false;
        }
    }

    const canMerge = currentWidget && selectedIndex < widgets.length - 1 && !isSeparator && !isFlexSeparator;
    const hasWidgets = widgets.length > 0;

    // Build mode-aware help text
    const buildHelpText = (): string => {
        if (editorMode === 'color') {
            const { editingBackground, hexInputMode, ansi256InputMode } = colorEditorState;

            if (hexInputMode || ansi256InputMode) {
                // Sub-modes render their own help text inline
                return '';
            }

            const colorType = editingBackground ? 'background' : 'foreground';
            const hexAnsiHelp = settings.colorLevel === 3
                ? ', (h)ex'
                : settings.colorLevel === 2
                    ? ', (a)nsi256'
                    : '';

            return `←→ cycle ${colorType}, (f) bg/fg, (b)old${hexAnsiHelp}, (r)eset\nTab: items mode, ESC: items mode`;
        }

        // Items mode
        let text = hasWidgets
            ? '↑↓ select, ←→ open type picker'
            : '(a)dd via picker, (i)nsert via picker';
        if (isSeparator) {
            text += ', Space edit separator';
        }
        if (hasWidgets) {
            text += ', Enter to move, (a)dd via picker, (i)nsert via picker, (d)elete, (c)lear line';
        }
        if (canToggleRaw) {
            text += ', (r)aw value';
        }
        if (canMerge) {
            text += ', (m)erge';
        }
        if (!isSeparator && !isFlexSeparator && hasWidgets) {
            text += ', (x) rules';
        }
        if (hasWidgets && !isSeparator && !isFlexSeparator) {
            text += ', Tab: color mode';
        }
        text += ', ESC: back';
        return text;
    };

    const helpText = buildHelpText();

    // Build custom keybinds text
    const customKeybindsText = customKeybinds.map(kb => kb.label).join(', ');
    const pickerActionLabel = widgetPicker?.action === 'add'
        ? 'Add Widget'
        : widgetPicker?.action === 'insert'
            ? 'Insert Widget'
            : 'Change Widget Type';

    // If custom editor is active, render it instead of the normal UI
    if (customEditorWidget?.impl.renderEditor) {
        return customEditorWidget.impl.renderEditor({
            widget: customEditorWidget.widget,
            onComplete: handleEditorComplete,
            onCancel: handleEditorCancel,
            action: customEditorWidget.action
        });
    }

    if (rulesEditorWidget) {
        return (
            <RulesEditor
                widget={rulesEditorWidget}
                settings={settings}
                onUpdate={(updatedWidget) => {
                    // Update widget in widgets array
                    const newWidgets = widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w
                    );
                    onUpdate(newWidgets);  // This triggers preview update!
                    setRulesEditorWidget(updatedWidget);  // Keep editor in sync
                }}
                onBack={() => { setRulesEditorWidget(null); }}
            />
        );
    }

    if (showClearConfirm) {
        return (
            <Box flexDirection='column'>
                <Text bold color='yellow'>⚠ Confirm Clear Line</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        This will remove all widgets from Line
                        {' '}
                        {lineNumber}
                        .
                    </Text>
                    <Text color='red'>This action cannot be undone!</Text>
                </Box>
                <Box marginTop={2}>
                    <Text>Continue?</Text>
                </Box>
                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            onUpdate([]);
                            setSelectedIndex(0);
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

    return (
        <Box flexDirection='column'>
            <Box>
                <Text bold>
                    Edit Line
                    {' '}
                    {lineNumber}
                    {' '}
                </Text>
                {moveMode && <Text color='blue'>[MOVE MODE]</Text>}
                {!moveMode && !widgetPicker && editorMode === 'color' && (
                    <Text color='magenta'>
                        [COLOR MODE
                        {colorEditorState.editingBackground ? ' - BACKGROUND' : ' - FOREGROUND'}
                        ]
                    </Text>
                )}
                {widgetPicker && <Text color='cyan'>{`[${pickerActionLabel.toUpperCase()}]`}</Text>}
                {(settings.powerline.enabled || Boolean(settings.defaultSeparator)) && (
                    <Box marginLeft={2}>
                        <Text color='yellow'>
                            ⚠
                            {' '}
                            {settings.powerline.enabled
                                ? 'Powerline mode active: separators controlled by powerline settings'
                                : 'Default separator active: manual separators disabled'}
                        </Text>
                    </Box>
                )}
            </Box>
            {moveMode ? (
                <Box flexDirection='column' marginBottom={1}>
                    <Text dimColor>↑↓ to move widget, ESC or Enter to exit move mode</Text>
                </Box>
            ) : widgetPicker ? (
                <Box flexDirection='column'>
                    {widgetPicker.level === 'category' ? (
                        <>
                            {widgetPicker.categoryQuery.trim().length > 0 ? (
                                <Text dimColor>↑↓ select widget match, Enter apply, ESC clear/cancel</Text>
                            ) : (
                                <Text dimColor>↑↓ select category, type to search all widgets, Enter continue, ESC cancel</Text>
                            )}
                            <Box>
                                <Text dimColor>Search: </Text>
                                <Text color='cyan'>{widgetPicker.categoryQuery || '(none)'}</Text>
                            </Box>
                        </>
                    ) : (
                        <>
                            <Text dimColor>↑↓ select widget, type to search widgets, Enter apply, ESC back</Text>
                            <Box>
                                <Text dimColor>
                                    Category:
                                    {' '}
                                    {selectedPickerCategory ?? '(none)'}
                                    {' '}
                                    | Search:
                                    {' '}
                                </Text>
                                <Text color='cyan'>{widgetPicker.widgetQuery || '(none)'}</Text>
                            </Box>
                        </>
                    )}
                </Box>
            ) : (
                <Box flexDirection='column'>
                    <Text dimColor>{helpText}</Text>
                    {editorMode === 'items' && <Text dimColor>{customKeybindsText || ' '}</Text>}
                </Box>
            )}
            {hasFlexSeparator && !widthDetectionAvailable && (
                <Box marginTop={1}>
                    <Text color='yellow'>⚠ Note: Terminal width detection is currently unavailable in your environment.</Text>
                    <Text dimColor>  Flex separators will act as normal separators until width detection is available.</Text>
                </Box>
            )}
            {widgetPicker && (
                <Box marginTop={1} flexDirection='column'>
                    {widgetPicker.level === 'category' ? (
                        widgetPicker.categoryQuery.trim().length > 0 ? (
                            topLevelSearchEntries.length === 0 ? (
                                <Text dimColor>No widgets match the search.</Text>
                            ) : (
                                <>
                                    {topLevelSearchEntries.map((entry, index) => {
                                        const isSelected = entry.type === selectedTopLevelSearchEntry?.type;
                                        const segments = getMatchSegments(entry.displayName, widgetPicker.categoryQuery);
                                        return (
                                            <Box key={entry.type} flexDirection='row' flexWrap='nowrap'>
                                                <Box width={3}>
                                                    <Text color={isSelected ? 'green' : undefined}>
                                                        {isSelected ? '▶ ' : '  '}
                                                    </Text>
                                                </Box>
                                                <Text color={isSelected ? 'green' : undefined}>{`${index + 1}. `}</Text>
                                                {segments.map((seg, i) => (
                                                    <Text
                                                        key={i}
                                                        color={isSelected ? 'green' : seg.matched ? 'yellowBright' : undefined}
                                                        bold={isSelected ? true : seg.matched}
                                                    >
                                                        {seg.text}
                                                    </Text>
                                                ))}
                                            </Box>
                                        );
                                    })}
                                    {selectedTopLevelSearchEntry && (
                                        <Box marginTop={1} paddingLeft={2}>
                                            <Text dimColor>{selectedTopLevelSearchEntry.description}</Text>
                                        </Box>
                                    )}
                                </>
                            )
                        ) : (
                            pickerCategories.length === 0 ? (
                                <Text dimColor>No categories available.</Text>
                            ) : (
                                <>
                                    {pickerCategories.map((category, index) => {
                                        const isSelected = category === selectedPickerCategory;
                                        return (
                                            <Box key={category} flexDirection='row' flexWrap='nowrap'>
                                                <Box width={3}>
                                                    <Text color={isSelected ? 'green' : undefined}>
                                                        {isSelected ? '▶ ' : '  '}
                                                    </Text>
                                                </Box>
                                                <Text color={isSelected ? 'green' : undefined}>
                                                    {`${index + 1}. ${category}`}
                                                </Text>
                                            </Box>
                                        );
                                    })}
                                    {selectedPickerCategory === 'All' && (
                                        <Box marginTop={1} paddingLeft={2}>
                                            <Text dimColor>Search across all widget categories.</Text>
                                        </Box>
                                    )}
                                </>
                            )
                        )
                    ) : (
                        pickerEntries.length === 0 ? (
                            <Text dimColor>No widgets match the current category/search.</Text>
                        ) : (
                            <>
                                {pickerEntries.map((entry, index) => {
                                    const isSelected = entry.type === selectedPickerEntry?.type;
                                    const segments = getMatchSegments(entry.displayName, widgetPicker.widgetQuery);
                                    return (
                                        <Box key={entry.type} flexDirection='row' flexWrap='nowrap'>
                                            <Box width={3}>
                                                <Text color={isSelected ? 'green' : undefined}>
                                                    {isSelected ? '▶ ' : '  '}
                                                </Text>
                                            </Box>
                                            <Text color={isSelected ? 'green' : undefined}>{`${index + 1}. `}</Text>
                                            {segments.map((seg, i) => (
                                                <Text
                                                    key={i}
                                                    color={isSelected ? 'green' : (seg.matched ? 'yellowBright' : undefined)}
                                                    bold={seg.matched}
                                                >
                                                    {seg.text}
                                                </Text>
                                            ))}
                                        </Box>
                                    );
                                })}
                                {selectedPickerEntry && (
                                    <Box marginTop={1} paddingLeft={2}>
                                        <Text dimColor>{selectedPickerEntry.description}</Text>
                                    </Box>
                                )}
                            </>
                        )
                    )}
                </Box>
            )}
            {!widgetPicker && editorMode === 'color' && colorEditorState.hexInputMode && (
                <Box marginTop={1} flexDirection='column'>
                    <Text>Enter 6-digit hex color code (without #):</Text>
                    <Text>
                        #
                        {colorEditorState.hexInput}
                        <Text dimColor>
                            {colorEditorState.hexInput.length < 6 ? '_'.repeat(6 - colorEditorState.hexInput.length) : ''}
                        </Text>
                    </Text>
                </Box>
            )}
            {!widgetPicker && editorMode === 'color' && colorEditorState.ansi256InputMode && (
                <Box marginTop={1} flexDirection='column'>
                    <Text>Enter ANSI 256 color code (0-255):</Text>
                    <Text>
                        {colorEditorState.ansi256Input}
                        <Text dimColor>
                            {colorEditorState.ansi256Input.length === 0
                                ? '___'
                                : colorEditorState.ansi256Input.length === 1
                                    ? '__'
                                    : colorEditorState.ansi256Input.length === 2
                                        ? '_'
                                        : ''}
                        </Text>
                    </Text>
                </Box>
            )}
            {!widgetPicker && editorMode === 'color' && !colorEditorState.hexInputMode && !colorEditorState.ansi256InputMode && (() => {
                const selectedWidget = widgets[selectedIndex];
                if (!selectedWidget) {
                    return null;
                }

                const isSep = selectedWidget.type === 'separator' || selectedWidget.type === 'flex-separator';
                if (isSep) {
                    return null;
                }

                const { colorIndex, totalColors, displayName } = getCurrentColorInfo(
                    selectedWidget,
                    colorEditorState.editingBackground
                );

                const colorType = colorEditorState.editingBackground ? 'background' : 'foreground';
                const colorNumber = colorIndex === -1 ? 'custom' : `${colorIndex}/${totalColors}`;

                const level = getColorLevelString(settings.colorLevel);
                const styledColor = colorEditorState.editingBackground
                    ? applyColors(` ${displayName} `, undefined, selectedWidget.backgroundColor, false, level)
                    : applyColors(displayName, selectedWidget.color, undefined, false, level);

                return (
                    <Box marginTop={1}>
                        <Text>
                            Current
                            {' '}
                            {colorType}
                            {' '}
                            (
                            {colorNumber}
                            ):
                            {' '}
                            {styledColor}
                            {selectedWidget.bold && <Text bold> [BOLD]</Text>}
                        </Text>
                    </Box>
                );
            })()}
            {!widgetPicker && (
                <Box marginTop={1} flexDirection='column'>
                    {widgets.length === 0 ? (
                        <Text dimColor>No widgets. Press 'a' to add one.</Text>
                    ) : (
                        <>
                            {widgets.map((widget, index) => {
                                const isSelected = index === selectedIndex;
                                const isSep = widget.type === 'separator' || widget.type === 'flex-separator';
                                const widgetImpl = !isSep ? getWidget(widget.type) : null;
                                const { displayText, modifierText } = widgetImpl?.getEditorDisplay(widget) ?? { displayText: getWidgetDisplay(widget) };
                                const supportsRawValue = widgetImpl?.supportsRawValue() ?? false;
                                const inColorMode = editorMode === 'color';

                                // Determine selector color: blue for move, magenta for color, green for items
                                const selectorColor = moveMode ? 'blue' : inColorMode ? 'magenta' : 'green';

                                // Build styled label for color mode
                                let styledLabel: string | undefined;
                                if (inColorMode && !isSep && widgetImpl) {
                                    const colorLevel = getColorLevelString(settings.colorLevel);
                                    const defaultColor = widgetImpl.getDefaultColor();
                                    const fgColor = widget.color ?? defaultColor;
                                    const bgColor = widget.backgroundColor;
                                    const boldFlag = widget.bold ?? false;
                                    styledLabel = applyColors(
                                        displayText || getWidgetDisplay(widget),
                                        fgColor,
                                        bgColor,
                                        boldFlag,
                                        colorLevel
                                    );
                                }

                                return (
                                    <Box key={widget.id} flexDirection='row' flexWrap='nowrap'>
                                        <Box width={3}>
                                            <Text color={isSelected ? selectorColor : undefined}>
                                                {isSelected ? (moveMode ? '◆ ' : '▶ ') : '  '}
                                            </Text>
                                        </Box>
                                        {inColorMode && isSep ? (
                                            <Text dimColor>
                                                {`${index + 1}. ${displayText || getWidgetDisplay(widget)}`}
                                            </Text>
                                        ) : inColorMode && styledLabel ? (
                                            <Text>
                                                {`${index + 1}. `}
                                                {styledLabel}
                                            </Text>
                                        ) : (
                                            <Text color={isSelected ? (moveMode ? 'blue' : 'green') : undefined}>
                                                {`${index + 1}. ${displayText || getWidgetDisplay(widget)}`}
                                            </Text>
                                        )}
                                        {modifierText && (
                                            <Text dimColor>
                                                {' '}
                                                {modifierText}
                                            </Text>
                                        )}
                                        {widget.type !== 'separator' && widget.type !== 'flex-separator' && (
                                            <Text dimColor>
                                                {' '}
                                                [
                                                {widget.color ?? 'default'}
                                                ]
                                            </Text>
                                        )}
                                        {supportsRawValue && widget.rawValue && <Text dimColor> (raw value)</Text>}
                                        {widget.merge === true && <Text dimColor> (merged→)</Text>}
                                        {widget.merge === 'no-padding' && <Text dimColor> (merged-no-pad→)</Text>}
                                        {widget.rules && widget.rules.length > 0 && (
                                            <Text dimColor>
                                                {' '}
                                                (
                                                {widget.rules.length}
                                                {' '}
                                                rule
                                                {widget.rules.length === 1 ? '' : 's'}
                                                )
                                            </Text>
                                        )}
                                    </Box>
                                );
                            })}
                            {/* Display description for selected widget */}
                            {currentWidget && (
                                <Box marginTop={1} paddingLeft={2}>
                                    <Text dimColor>
                                        {(() => {
                                            if (currentWidget.type === 'separator') {
                                                return 'A separator character between status line widgets';
                                            } else if (currentWidget.type === 'flex-separator') {
                                                return 'Expands to fill available terminal width';
                                            } else {
                                                const widgetImpl = getWidget(currentWidget.type);
                                                return widgetImpl ? widgetImpl.getDescription() : 'Unknown widget type';
                                            }
                                        })()}
                                    </Text>
                                </Box>
                            )}
                        </>
                    )}
                </Box>
            )}
        </Box>
    );
};