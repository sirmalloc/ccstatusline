import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import type {
    Widget,
    WidgetItem,
    WidgetItemType
} from '../../types/Widget';
import { getBackgroundColorsForPowerline } from '../../utils/colors';
import { generateGuid } from '../../utils/guid';
import { canDetectTerminalWidth } from '../../utils/terminal';
import {
    filterWidgetCatalog,
    getWidget,
    getWidgetCatalog,
    getWidgetCatalogCategories
} from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';

export interface ItemsEditorProps {
    widgets: WidgetItem[];
    onUpdate: (widgets: WidgetItem[]) => void;
    onBack: () => void;
    lineNumber: number;
    settings: Settings;
}

type WidgetPickerAction = 'change' | 'add' | 'insert';
type WidgetPickerLevel = 'category' | 'widget';

interface WidgetPickerState {
    action: WidgetPickerAction;
    level: WidgetPickerLevel;
    selectedCategory: string | null;
    categoryQuery: string;
    widgetQuery: string;
    selectedType: WidgetItemType | null;
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({ widgets, onUpdate, onBack, lineNumber, settings }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [moveMode, setMoveMode] = useState(false);
    const [customEditorWidget, setCustomEditorWidget] = useState<{ widget: WidgetItem; impl: Widget; action?: string } | null>(null);
    const [widgetPicker, setWidgetPicker] = useState<WidgetPickerState | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
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

    const getFilteredCategories = (query: string): string[] => {
        void query;
        return [...widgetCategories];
    };

    const normalizePickerState = (state: WidgetPickerState): WidgetPickerState => {
        const filteredCategories = getFilteredCategories(state.categoryQuery);
        const selectedCategory = state.selectedCategory && filteredCategories.includes(state.selectedCategory)
            ? state.selectedCategory
            : (filteredCategories[0] ?? null);

        const hasTopLevelSearch = state.level === 'category' && state.categoryQuery.trim().length > 0;
        const effectiveCategory = hasTopLevelSearch ? 'All' : (selectedCategory ?? 'All');
        const effectiveQuery = hasTopLevelSearch ? state.categoryQuery : state.widgetQuery;
        const filteredWidgets = filterWidgetCatalog(widgetCatalog, effectiveCategory, effectiveQuery);
        const hasSelectedType = state.selectedType
            ? filteredWidgets.some(entry => entry.type === state.selectedType)
            : false;

        return {
            ...state,
            selectedCategory,
            selectedType: hasSelectedType ? state.selectedType : (filteredWidgets[0]?.type ?? null)
        };
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
        }));
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

        // Skip input handling when clear confirmation is active - let ConfirmDialog handle it
        if (showClearConfirm) {
            return;
        }

        if (widgetPicker) {
            const filteredCategories = getFilteredCategories(widgetPicker.categoryQuery);
            const selectedCategory = widgetPicker.selectedCategory && filteredCategories.includes(widgetPicker.selectedCategory)
                ? widgetPicker.selectedCategory
                : (filteredCategories[0] ?? null);
            const hasTopLevelSearch = widgetPicker.level === 'category' && widgetPicker.categoryQuery.trim().length > 0;
            const topLevelSearchEntries = hasTopLevelSearch
                ? filterWidgetCatalog(widgetCatalog, 'All', widgetPicker.categoryQuery)
                : [];
            const topLevelSelectedEntry = topLevelSearchEntries.find(entry => entry.type === widgetPicker.selectedType) ?? topLevelSearchEntries[0];
            const filteredWidgets = filterWidgetCatalog(widgetCatalog, selectedCategory ?? 'All', widgetPicker.widgetQuery);
            const selectedEntry = filteredWidgets.find(entry => entry.type === widgetPicker.selectedType) ?? filteredWidgets[0];

            if (widgetPicker.level === 'category') {
                if (key.escape) {
                    if (widgetPicker.categoryQuery.length > 0) {
                        setWidgetPicker(prev => prev ? normalizePickerState({
                            ...prev,
                            categoryQuery: ''
                        }) : prev);
                    } else {
                        setWidgetPicker(null);
                    }
                } else if (key.return) {
                    if (hasTopLevelSearch) {
                        if (topLevelSelectedEntry) {
                            applyWidgetPickerSelection(topLevelSelectedEntry.type);
                        }
                    } else if (selectedCategory) {
                        setWidgetPicker(prev => prev ? normalizePickerState({
                            ...prev,
                            level: 'widget',
                            selectedCategory
                        }) : prev);
                    }
                } else if (key.upArrow || key.downArrow) {
                    if (hasTopLevelSearch) {
                        if (topLevelSearchEntries.length === 0) {
                            return;
                        }

                        let currentIndex = topLevelSearchEntries.findIndex(entry => entry.type === widgetPicker.selectedType);
                        if (currentIndex === -1) {
                            currentIndex = 0;
                        }

                        const nextIndex = key.downArrow
                            ? Math.min(topLevelSearchEntries.length - 1, currentIndex + 1)
                            : Math.max(0, currentIndex - 1);
                        const nextType = topLevelSearchEntries[nextIndex]?.type ?? null;
                        setWidgetPicker(prev => prev ? normalizePickerState({
                            ...prev,
                            selectedType: nextType
                        }) : prev);
                    } else {
                        if (filteredCategories.length === 0) {
                            return;
                        }

                        let currentIndex = filteredCategories.findIndex(category => category === selectedCategory);
                        if (currentIndex === -1) {
                            currentIndex = 0;
                        }

                        const nextIndex = key.downArrow
                            ? Math.min(filteredCategories.length - 1, currentIndex + 1)
                            : Math.max(0, currentIndex - 1);
                        const nextCategory = filteredCategories[nextIndex] ?? null;
                        setWidgetPicker(prev => prev ? normalizePickerState({
                            ...prev,
                            selectedCategory: nextCategory
                        }) : prev);
                    }
                } else if (key.backspace || key.delete) {
                    setWidgetPicker(prev => prev ? normalizePickerState({
                        ...prev,
                        categoryQuery: prev.categoryQuery.slice(0, -1)
                    }) : prev);
                } else if (
                    input
                    && !key.ctrl
                    && !key.meta
                    && !key.tab
                ) {
                    setWidgetPicker(prev => prev ? normalizePickerState({
                        ...prev,
                        categoryQuery: prev.categoryQuery + input
                    }) : prev);
                }
            } else {
                if (key.escape) {
                    if (widgetPicker.widgetQuery.length > 0) {
                        setWidgetPicker(prev => prev ? normalizePickerState({
                            ...prev,
                            widgetQuery: ''
                        }) : prev);
                    } else {
                        setWidgetPicker(prev => prev ? normalizePickerState({
                            ...prev,
                            level: 'category'
                        }) : prev);
                    }
                } else if (key.return) {
                    if (selectedEntry) {
                        applyWidgetPickerSelection(selectedEntry.type);
                    }
                } else if (key.upArrow || key.downArrow) {
                    if (filteredWidgets.length === 0) {
                        return;
                    }

                    let currentIndex = filteredWidgets.findIndex(entry => entry.type === widgetPicker.selectedType);
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }

                    const nextIndex = key.downArrow
                        ? Math.min(filteredWidgets.length - 1, currentIndex + 1)
                        : Math.max(0, currentIndex - 1);
                    const nextType = filteredWidgets[nextIndex]?.type ?? null;
                    setWidgetPicker(prev => prev ? normalizePickerState({
                        ...prev,
                        selectedType: nextType
                    }) : prev);
                } else if (key.backspace || key.delete) {
                    setWidgetPicker(prev => prev ? normalizePickerState({
                        ...prev,
                        widgetQuery: prev.widgetQuery.slice(0, -1)
                    }) : prev);
                } else if (
                    input
                    && !key.ctrl
                    && !key.meta
                    && !key.tab
                ) {
                    setWidgetPicker(prev => prev ? normalizePickerState({
                        ...prev,
                        widgetQuery: prev.widgetQuery + input
                    }) : prev);
                }
            }

            return;
        }

        if (moveMode) {
            // In move mode, use up/down to move the selected item
            if (key.upArrow && selectedIndex > 0) {
                const newWidgets = [...widgets];
                const temp = newWidgets[selectedIndex];
                const prev = newWidgets[selectedIndex - 1];
                if (temp && prev) {
                    [newWidgets[selectedIndex], newWidgets[selectedIndex - 1]] = [prev, temp];
                }
                onUpdate(newWidgets);
                setSelectedIndex(selectedIndex - 1);
            } else if (key.downArrow && selectedIndex < widgets.length - 1) {
                const newWidgets = [...widgets];
                const temp = newWidgets[selectedIndex];
                const next = newWidgets[selectedIndex + 1];
                if (temp && next) {
                    [newWidgets[selectedIndex], newWidgets[selectedIndex + 1]] = [next, temp];
                }
                onUpdate(newWidgets);
                setSelectedIndex(selectedIndex + 1);
            } else if (key.escape || key.return) {
                // Exit move mode
                setMoveMode(false);
            }
        } else {
            // Normal mode
            if (key.upArrow && widgets.length > 0) {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            } else if (key.downArrow && widgets.length > 0) {
                setSelectedIndex(Math.min(widgets.length - 1, selectedIndex + 1));
            } else if (key.leftArrow && widgets.length > 0) {
                openWidgetPicker('change');
            } else if (key.rightArrow && widgets.length > 0) {
                openWidgetPicker('change');
            } else if (key.return && widgets.length > 0) {
                // Enter move mode
                setMoveMode(true);
            } else if (input === 'a') {
                openWidgetPicker('add');
            } else if (input === 'i') {
                openWidgetPicker('insert');
            } else if (input === 'd' && widgets.length > 0) {
                // Delete selected item
                const newWidgets = widgets.filter((_, i) => i !== selectedIndex);
                onUpdate(newWidgets);
                if (selectedIndex >= newWidgets.length && selectedIndex > 0) {
                    setSelectedIndex(selectedIndex - 1);
                }
            } else if (input === 'c') {
                if (widgets.length > 0) {
                    setShowClearConfirm(true);
                }
            } else if (input === ' ' && widgets.length > 0) {
                // Space key - cycle separator character for separator types only (not flex)
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type === 'separator') {
                    const currentChar = currentWidget.character ?? '|';
                    const currentCharIndex = separatorChars.indexOf(currentChar);
                    const nextChar = separatorChars[(currentCharIndex + 1) % separatorChars.length];
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, character: nextChar };
                    onUpdate(newWidgets);
                }
            } else if (input === 'r' && widgets.length > 0) {
                // Toggle raw value for widgets that support it
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
                    const widgetImpl = getWidget(currentWidget.type);
                    if (!widgetImpl?.supportsRawValue()) {
                        return;
                    }
                    const newWidgets = [...widgets];
                    newWidgets[selectedIndex] = { ...currentWidget, rawValue: !currentWidget.rawValue };
                    onUpdate(newWidgets);
                }
            } else if (input === 'm' && widgets.length > 0) {
                // Cycle through merge states: undefined -> true -> 'no-padding' -> undefined
                const currentWidget = widgets[selectedIndex];
                // Don't allow merge on the last item or on separators
                if (currentWidget && selectedIndex < widgets.length - 1
                    && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
                    const newWidgets = [...widgets];
                    let nextMergeState: boolean | 'no-padding' | undefined;

                    if (currentWidget.merge === undefined) {
                        nextMergeState = true;
                    } else if (currentWidget.merge === true) {
                        nextMergeState = 'no-padding';
                    } else {
                        nextMergeState = undefined;
                    }

                    if (nextMergeState === undefined) {
                        const { merge, ...rest } = currentWidget;
                        void merge; // Intentionally unused
                        newWidgets[selectedIndex] = rest;
                    } else {
                        newWidgets[selectedIndex] = { ...currentWidget, merge: nextMergeState };
                    }
                    onUpdate(newWidgets);
                }
            } else if (key.escape) {
                onBack();
            } else if (widgets.length > 0) {
                // Check for custom widget keybinds
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
                    const widgetImpl = getWidget(currentWidget.type);
                    if (widgetImpl) {
                        if (widgetImpl.getCustomKeybinds) {
                            const customKeybinds = widgetImpl.getCustomKeybinds();
                            const matchedKeybind = customKeybinds.find(kb => kb.key === input);

                            if (matchedKeybind && !key.ctrl) {
                                // Check if widget handles the action directly
                                if (widgetImpl.handleEditorAction) {
                                    // Let the widget handle the action directly
                                    const updatedWidget = widgetImpl.handleEditorAction(matchedKeybind.action, currentWidget);
                                    if (updatedWidget) {
                                        const newWidgets = [...widgets];
                                        newWidgets[selectedIndex] = updatedWidget;
                                        onUpdate(newWidgets);
                                    } else if (widgetImpl.renderEditor) {
                                        // If handleEditorAction returned null, open the editor
                                        setCustomEditorWidget({ widget: currentWidget, impl: widgetImpl, action: matchedKeybind.action });
                                    }
                                } else if (widgetImpl.renderEditor) {
                                    // Open the widget's custom editor with the action
                                    setCustomEditorWidget({ widget: currentWidget, impl: widgetImpl, action: matchedKeybind.action });
                                }
                            }
                        }
                    }
                }
            }
        }
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
        ? getFilteredCategories(widgetPicker.categoryQuery)
        : [];
    const selectedPickerCategory = widgetPicker
        ? (widgetPicker.selectedCategory && pickerCategories.includes(widgetPicker.selectedCategory)
            ? widgetPicker.selectedCategory
            : (pickerCategories[0] ?? null))
        : null;
    const topLevelSearchEntries = widgetPicker && widgetPicker.level === 'category' && widgetPicker.categoryQuery.trim().length > 0
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
    let customKeybinds: { key: string; label: string; action: string }[] = [];
    if (currentWidget && !isSeparator && !isFlexSeparator) {
        const widgetImpl = getWidget(currentWidget.type);
        if (widgetImpl) {
            canToggleRaw = widgetImpl.supportsRawValue();
            // Get custom keybinds from the widget
            if (widgetImpl.getCustomKeybinds) {
                customKeybinds = widgetImpl.getCustomKeybinds();
            }
        } else {
            canToggleRaw = false;
        }
    }

    const canMerge = currentWidget && selectedIndex < widgets.length - 1 && !isSeparator && !isFlexSeparator;
    const hasWidgets = widgets.length > 0;

    // Build main help text (without custom keybinds)
    let helpText = hasWidgets
        ? '↑↓ select, ←→ open type picker'
        : '(a)dd via picker, (i)nsert via picker';
    if (isSeparator) {
        helpText += ', Space edit separator';
    }
    if (hasWidgets) {
        helpText += ', Enter to move, (a)dd via picker, (i)nsert via picker, (d)elete, (c)lear line';
    }
    if (canToggleRaw) {
        helpText += ', (r)aw value';
    }
    if (canMerge) {
        helpText += ', (m)erge';
    }
    helpText += ', ESC back';

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
                    <Text dimColor>{customKeybindsText || ' '}</Text>
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
                                        return (
                                            <Box key={entry.type} flexDirection='row' flexWrap='nowrap'>
                                                <Box width={3}>
                                                    <Text color={isSelected ? 'green' : undefined}>
                                                        {isSelected ? '▶ ' : '  '}
                                                    </Text>
                                                </Box>
                                                <Text color={isSelected ? 'green' : undefined}>
                                                    {`${index + 1}. ${entry.displayName}`}
                                                </Text>
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
                                    return (
                                        <Box key={entry.type} flexDirection='row' flexWrap='nowrap'>
                                            <Box width={3}>
                                                <Text color={isSelected ? 'green' : undefined}>
                                                    {isSelected ? '▶ ' : '  '}
                                                </Text>
                                            </Box>
                                            <Text color={isSelected ? 'green' : undefined}>
                                                {`${index + 1}. ${entry.displayName}`}
                                            </Text>
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
            {!widgetPicker && (
                <Box marginTop={1} flexDirection='column'>
                    {widgets.length === 0 ? (
                        <Text dimColor>No widgets. Press 'a' to add one.</Text>
                    ) : (
                        <>
                            {widgets.map((widget, index) => {
                                const isSelected = index === selectedIndex;
                                const widgetImpl = widget.type !== 'separator' && widget.type !== 'flex-separator' ? getWidget(widget.type) : null;
                                const { displayText, modifierText } = widgetImpl?.getEditorDisplay(widget) ?? { displayText: getWidgetDisplay(widget) };
                                const supportsRawValue = widgetImpl?.supportsRawValue() ?? false;

                                return (
                                    <Box key={widget.id} flexDirection='row' flexWrap='nowrap'>
                                        <Box width={3}>
                                            <Text color={isSelected ? (moveMode ? 'blue' : 'green') : undefined}>
                                                {isSelected ? (moveMode ? '◆ ' : '▶ ') : '  '}
                                            </Text>
                                        </Box>
                                        <Text color={isSelected ? (moveMode ? 'blue' : 'green') : undefined}>
                                            {`${index + 1}. ${displayText || getWidgetDisplay(widget)}`}
                                        </Text>
                                        {modifierText && (
                                            <Text dimColor>
                                                {' '}
                                                {modifierText}
                                            </Text>
                                        )}
                                        {supportsRawValue && widget.rawValue && <Text dimColor> (raw value)</Text>}
                                        {widget.merge === true && <Text dimColor> (merged→)</Text>}
                                        {widget.merge === 'no-padding' && <Text dimColor> (merged-no-pad→)</Text>}
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