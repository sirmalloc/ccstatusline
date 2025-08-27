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
    getAllWidgetTypes,
    getWidget
} from '../../utils/widgets';

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
    const [customEditorWidget, setCustomEditorWidget] = useState<{ widget: WidgetItem; impl: Widget; action?: string } | null>(null);
    const separatorChars = ['|', '-', ',', ' '];

    // Determine which item types are allowed based on settings
    const getAllowedTypes = (): WidgetItemType[] => {
        let allowedTypes = getAllWidgetTypes(settings);

        // Remove separator if default separator is set
        if (settings.defaultSeparator) {
            allowedTypes = allowedTypes.filter(t => t !== 'separator');
        }

        // Remove both separator and flex-separator if powerline mode is enabled
        if (settings.powerline.enabled) {
            allowedTypes = allowedTypes.filter(t => t !== 'separator' && t !== 'flex-separator');
        }

        return allowedTypes;
    };

    // Get the default type for new widgets (first non-separator type)
    const getDefaultItemType = (): WidgetItemType => {
        const allowedTypes = getAllowedTypes();
        return allowedTypes.includes('model') ? 'model' : (allowedTypes[0] ?? 'model');
    };

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

    useInput((input, key) => {
        // Skip input if custom editor is active
        if (customEditorWidget) {
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
            if (key.upArrow) {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            } else if (key.downArrow) {
                setSelectedIndex(Math.min(widgets.length - 1, selectedIndex + 1));
            } else if (key.leftArrow && widgets.length > 0) {
                // Toggle item type backwards
                const types = getAllowedTypes();
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const currentType = currentWidget.type;
                    let currentIndex = types.indexOf(currentType);
                    // If current type is not in allowed types (e.g., separator when disabled), find a valid type
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }
                    const prevIndex = currentIndex === 0 ? types.length - 1 : currentIndex - 1;
                    const newWidgets = [...widgets];
                    const prevType = types[prevIndex];
                    if (prevType) {
                        newWidgets[selectedIndex] = { ...currentWidget, type: prevType };
                        onUpdate(newWidgets);
                    }
                }
            } else if (key.rightArrow && widgets.length > 0) {
                // Toggle item type forwards
                const types = getAllowedTypes();
                const currentWidget = widgets[selectedIndex];
                if (currentWidget) {
                    const currentType = currentWidget.type;
                    let currentIndex = types.indexOf(currentType);
                    // If current type is not in allowed types (e.g., separator when disabled), find a valid type
                    if (currentIndex === -1) {
                        currentIndex = 0;
                    }
                    const nextIndex = (currentIndex + 1) % types.length;
                    const newWidgets = [...widgets];
                    const nextType = types[nextIndex];
                    if (nextType) {
                        newWidgets[selectedIndex] = { ...currentWidget, type: nextType };
                        onUpdate(newWidgets);
                    }
                }
            } else if (key.return && widgets.length > 0) {
                // Enter move mode
                setMoveMode(true);
            } else if (input === 'a') {
                // Add widget after selected
                const insertIndex = widgets.length > 0 ? selectedIndex + 1 : 0;
                const backgroundColor = getUniqueBackgroundColor(insertIndex);
                const newWidget: WidgetItem = {
                    id: generateGuid(),
                    type: getDefaultItemType(),
                    ...(backgroundColor && { backgroundColor })
                };
                const newWidgets = [...widgets];
                newWidgets.splice(insertIndex, 0, newWidget);
                onUpdate(newWidgets);
                setSelectedIndex(insertIndex); // Move selection to new widget
            } else if (input === 'i') {
                // Insert item before selected
                const insertIndex = selectedIndex;
                const backgroundColor = getUniqueBackgroundColor(insertIndex);
                const newWidget: WidgetItem = {
                    id: generateGuid(),
                    type: getDefaultItemType(),
                    ...(backgroundColor && { backgroundColor })
                };
                const newWidgets = [...widgets];
                newWidgets.splice(insertIndex, 0, newWidget);
                onUpdate(newWidgets);
                // Keep selection on the new widget (which is now at selectedIndex)
            } else if (input === 'd' && widgets.length > 0) {
                // Delete selected item
                const newWidgets = widgets.filter((_, i) => i !== selectedIndex);
                onUpdate(newWidgets);
                if (selectedIndex >= newWidgets.length && selectedIndex > 0) {
                    setSelectedIndex(selectedIndex - 1);
                }
            } else if (input === 'c') {
                // Clear entire line
                onUpdate([]);
                setSelectedIndex(0);
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
                // Toggle raw value for non-separator items
                const currentWidget = widgets[selectedIndex];
                if (currentWidget && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator' && currentWidget.type !== 'custom-text') {
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

    // Build main help text (without custom keybinds)
    let helpText = '↑↓ select, ←→ change type';
    if (isSeparator) {
        helpText += ', Space edit separator';
    }
    helpText += ', Enter to move, (a)dd, (i)nsert, (d)elete, (c)lear line';
    if (canToggleRaw) {
        helpText += ', (r)aw value';
    }
    if (canMerge) {
        helpText += ', (m)erge';
    }
    helpText += ', ESC back';

    // Build custom keybinds text
    const customKeybindsText = customKeybinds.map(kb => kb.label).join(', ');

    // If custom editor is active, render it instead of the normal UI
    if (customEditorWidget?.impl.renderEditor) {
        return customEditorWidget.impl.renderEditor({
            widget: customEditorWidget.widget,
            onComplete: handleEditorComplete,
            onCancel: handleEditorCancel,
            action: customEditorWidget.action
        });
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
            <Box marginTop={1} flexDirection='column'>
                {widgets.length === 0 ? (
                    <Text dimColor>No widgets. Press 'a' to add one.</Text>
                ) : (
                    <>
                        {widgets.map((widget, index) => {
                            const isSelected = index === selectedIndex;
                            const widgetImpl = widget.type !== 'separator' && widget.type !== 'flex-separator' ? getWidget(widget.type) : null;
                            const { displayText, modifierText } = widgetImpl?.getEditorDisplay(widget) ?? { displayText: getWidgetDisplay(widget) };

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
                                    {widget.rawValue && <Text dimColor> (raw value)</Text>}
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
        </Box>
    );
};