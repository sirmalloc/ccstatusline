import {
    Box,
    Text,
    useInput,
    useStdout
} from 'ink';
import React, {
    useEffect,
    useMemo,
    useState
} from 'react';

import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetItem,
    WidgetItemType
} from '../../types/Widget';
import { getBackgroundColorsForPowerline } from '../../utils/colors';
import { generateGuid } from '../../utils/guid';
import {
    getNumberFormatKeybind,
    getNumberFormatModifierText
} from '../../utils/number-format';
import { canDetectTerminalWidth } from '../../utils/terminal';
import {
    filterWidgetCatalog,
    getMatchSegments,
    getWidget,
    getWidgetCatalog,
    getWidgetCatalogCategories
} from '../../utils/widgets';
import {
    EDIT_HIDE_STATES_ACTION,
    getHideKeybind,
    getHideModifierText
} from '../../widgets/shared/hideable';
import {
    EDIT_LABEL_ACTION,
    getLabelKeybind,
    getLabelModifierText
} from '../../widgets/shared/raw-or-labeled';

import { ConfirmDialog } from './ConfirmDialog';
import { HideStatesEditor } from './HideStatesEditor';
import { LabelEditor } from './LabelEditor';
import {
    handleMoveInputMode,
    handleNormalInputMode,
    handlePickerInputMode,
    normalizePickerState,
    type CustomEditorWidgetState,
    type WidgetPickerAction,
    type WidgetPickerState
} from './items-editor/input-handlers';
import {
    getDescriptionRows,
    getListWindow,
    getPickerMaxVisible
} from './items-editor/list-window';
import {
    getPickerInsertIndex,
    placePickerSelection
} from './items-editor/picker-selection';

export interface ItemsEditorProps {
    widgets: WidgetItem[];
    onUpdate: (widgets: WidgetItem[]) => void;
    // Receives the line as it would look with a pending change (a label draft,
    // or the widget highlighted in the picker), or null when nothing is being
    // previewed. Pass a stable callback.
    onPreviewChange?: (widgets: WidgetItem[] | null) => void;
    onBack: () => void;
    // Lets the caller restore the cursor, e.g. after a dev reload
    initialSelectedIndex?: number;
    onSelectedIndexChange?: (index: number) => void;
    lineNumber: number;
    settings: Settings;
}

function isMergedIntoPreviousWidget(widgets: WidgetItem[], index: number): boolean {
    if (index <= 0) {
        return false;
    }

    return Boolean(widgets[index - 1]?.merge);
}

// The highlighted widget's description is indented under the picker list
const DESCRIPTION_INDENT = 2;

const HiddenEntriesMarker: React.FC<{ arrow: string; count: number }> = ({ arrow, count }) => (
    <Box paddingLeft={3}>
        <Text dimColor>{count > 0 ? `${arrow} ${count} more` : ' '}</Text>
    </Box>
);

// Long picker lists show only the entries around the selection so the whole
// screen, status line preview included, fits in the terminal. Both marker
// rows stay reserved while windowed so the list doesn't shift as it scrolls.
function renderWindowedList<T>(
    items: T[],
    selectedIndex: number,
    maxVisible: number,
    renderItem: (item: T, index: number) => React.ReactNode
): React.ReactNode {
    const visible = getListWindow(items.length, Math.max(0, selectedIndex), maxVisible);
    const isWindowed = items.length > maxVisible;

    return (
        <>
            {isWindowed && <HiddenEntriesMarker arrow='↑' count={visible.hiddenAbove} />}
            {items.slice(visible.start, visible.end).map((item, offset) => renderItem(item, visible.start + offset))}
            {isWindowed && <HiddenEntriesMarker arrow='↓' count={visible.hiddenBelow} />}
        </>
    );
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({
    widgets,
    onUpdate,
    onPreviewChange,
    onBack,
    initialSelectedIndex = 0,
    onSelectedIndexChange,
    lineNumber,
    settings
}) => {
    const [selectedIndex, setSelectedIndex] = useState(() => Math.min(initialSelectedIndex, Math.max(0, widgets.length - 1)));
    const [moveMode, setMoveMode] = useState(false);
    const [customEditorWidget, setCustomEditorWidget] = useState<CustomEditorWidgetState | null>(null);
    const [widgetPicker, setWidgetPicker] = useState<WidgetPickerState | null>(null);
    // Identity and powerline background of the widget an add/insert would
    // create, fixed when the picker opens so the preview doesn't change color
    // on every keypress and Enter adds exactly what was previewed
    const [pickerNewWidget, setPickerNewWidget] = useState<Omit<WidgetItem, 'type'> | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const { stdout } = useStdout();
    const separatorChars = ['|', '-', ',', ' '];

    // Discard a label draft or picker preview if navigation unmounts the editor (for example, a save dialog).
    useEffect(() => () => {
        onPreviewChange?.(null);
    }, [onPreviewChange]);

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
        onPreviewChange?.(null);
        setCustomEditorWidget(null);
    };

    const handleEditorCancel = () => {
        onPreviewChange?.(null);
        setCustomEditorWidget(null);
    };

    const getCustomKeybindsForWidget = (widgetImpl: Widget, widget: WidgetItem): CustomKeybind[] => {
        const keybinds = widgetImpl.getCustomKeybinds ? [...widgetImpl.getCustomKeybinds(widget)] : [];

        // Numeric widgets get the precision cycle here rather than in the color
        // menu, so every non-color override stays on this screen and stays
        // reachable while a powerline theme is active.
        if (widgetImpl.supportsNumberFormat?.()) {
            keybinds.push(getNumberFormatKeybind());
        }

        // Widgets declaring hideable states share a single (h)ide… keybind
        // that opens the hide-state checklist instead of per-widget toggles.
        // Such widgets must leave 'h' unbound: keybind matching takes the
        // first hit, so a widget-level 'h' would shadow this one (enforced by
        // a registry-wide test in utils/__tests__/widgets.test.ts)
        if ((widgetImpl.getHideableStates?.().length ?? 0) > 0) {
            keybinds.push(getHideKeybind());
        }

        // The label only shows when raw value is off, so the editor is offered
        // only then. Like 'h', widgets must leave this key unbound.
        if (!widget.rawValue && widgetImpl.getLabelPrefix?.(widget) !== undefined) {
            keybinds.push(getLabelKeybind());
        }

        return keybinds;
    };

    const openWidgetPicker = (action: WidgetPickerAction) => {
        if (widgetCatalog.length === 0) {
            return;
        }

        const currentType = widgets[selectedIndex]?.type;
        const selectedType = action === 'change' ? currentType ?? null : null;
        const backgroundColor = action === 'change'
            ? undefined
            : getUniqueBackgroundColor(getPickerInsertIndex(action, widgets.length, selectedIndex));

        setPickerNewWidget({
            id: generateGuid(),
            ...(backgroundColor && { backgroundColor })
        });
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

        const placement = placePickerSelection(
            widgets,
            widgetPicker.action,
            selectedIndex,
            selectedType,
            pickerNewWidget ?? { id: generateGuid() }
        );
        if (placement.widgets !== widgets) {
            onUpdate(placement.widgets);
            setSelectedIndex(placement.selectedIndex);
        }

        setWidgetPicker(null);
    };

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

    // On the last widget, m only clears a merge left there
    const canMerge = currentWidget && (selectedIndex < widgets.length - 1 || Boolean(currentWidget.merge))
        && !isSeparator && !isFlexSeparator;
    const canExcludeAlign = Boolean(currentWidget) && !isSeparator && !isFlexSeparator
        && settings.powerline.enabled && settings.powerline.autoAlign
        && !isMergedIntoPreviousWidget(widgets, selectedIndex);
    const hasWidgets = widgets.length > 0;

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
            canExcludeAlign,
            separatorChars,
            onBack,
            onUpdate,
            setSelectedIndex,
            setMoveMode,
            setShowClearConfirm,
            openWidgetPicker,
            getCustomKeybindsForWidget,
            setCustomEditorWidget,
            getUniqueBackgroundColor
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
    // The list leaves room for the tallest description among its entries, so
    // moving the highlight never makes the screen taller than the terminal
    const browsedEntries = widgetPicker?.level === 'widget' ? pickerEntries : topLevelSearchEntries;
    const descriptionWidth = stdout.columns ? stdout.columns - DESCRIPTION_INDENT : undefined;
    const pickerMaxVisible = getPickerMaxVisible(
        stdout.rows,
        settings.lines.filter(line => line.length > 0).length,
        Math.max(1, ...browsedEntries.map(entry => getDescriptionRows(entry.description, descriptionWidth)))
    );

    // Only a widget the picker visibly highlights is previewed; browsing the
    // category list leaves the line as it is
    // In the widget list, its highlighted entry; among categories, the top search result
    const searchResultType = widgetPicker && widgetPicker.categoryQuery.trim().length > 0 ? selectedTopLevelSearchEntry?.type : undefined;
    const highlightedPickerType = widgetPicker?.level === 'widget' ? selectedPickerEntry?.type : searchResultType;
    const pickerAction = widgetPicker?.action;
    const previewWidgets = useMemo(() => {
        if (!pickerAction || !highlightedPickerType || !pickerNewWidget) {
            return null;
        }

        return placePickerSelection(widgets, pickerAction, selectedIndex, highlightedPickerType, pickerNewWidget).widgets;
    }, [widgets, pickerAction, selectedIndex, highlightedPickerType, pickerNewWidget]);

    useEffect(() => {
        onPreviewChange?.(previewWidgets);
    }, [onPreviewChange, previewWidgets]);

    useEffect(() => {
        onSelectedIndexChange?.(selectedIndex);
    }, [onSelectedIndexChange, selectedIndex]);

    // Build main help text (without custom keybinds)
    let helpText = hasWidgets
        ? '↑↓ select, ←→ open type picker'
        : '(a)dd via picker, (i)nsert via picker';
    if (isSeparator) {
        helpText += ', Space edit separator';
    }
    if (hasWidgets) {
        helpText += ', Enter to move, (a)dd via picker, (i)nsert via picker, (k) clone, (d)elete, (c)lear line';
    }
    if (canToggleRaw) {
        helpText += ', (r)aw value';
    }
    if (canMerge) {
        helpText += ', (m)erge';
    }
    if (canExcludeAlign) {
        helpText += ', e(x)clude align';
    }
    helpText += ', ESC back';

    // Build custom keybinds text
    const customKeybindsText = customKeybinds.map(kb => kb.label).join(', ');
    const pickerActionLabel = widgetPicker?.action === 'add'
        ? 'Add Widget'
        : widgetPicker?.action === 'insert'
            ? 'Insert Widget'
            : 'Change Widget Type';

    // The hide-state checklist is shared across all widgets that declare
    // hideable states, so it renders here rather than via widget renderEditor
    if (customEditorWidget?.action === EDIT_HIDE_STATES_ACTION) {
        return (
            <HideStatesEditor
                widget={customEditorWidget.widget}
                states={customEditorWidget.impl.getHideableStates?.() ?? []}
                onComplete={handleEditorComplete}
                onCancel={handleEditorCancel}
            />
        );
    }

    const editorLabel = customEditorWidget?.impl.getLabelPrefix?.(customEditorWidget.widget);
    if (customEditorWidget?.action === EDIT_LABEL_ACTION && editorLabel !== undefined) {
        return (
            <LabelEditor
                widget={customEditorWidget.widget}
                defaultLabel={editorLabel}
                onComplete={handleEditorComplete}
                onCancel={handleEditorCancel}
                onPreview={(updatedWidget) => {
                    const previewWidgets = [...widgets];
                    previewWidgets[selectedIndex] = updatedWidget;
                    onPreviewChange?.(previewWidgets);
                }}
            />
        );
    }

    // If custom editor is active, render it instead of the normal UI
    if (customEditorWidget?.impl.renderEditor) {
        return customEditorWidget.impl.renderEditor({
            widget: customEditorWidget.widget,
            onComplete: handleEditorComplete,
            onCancel: handleEditorCancel,
            action: customEditorWidget.action,
            settings
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
                                ? 'Powerline mode active: manual separators disabled'
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
                                    {renderWindowedList(topLevelSearchEntries, topLevelSearchEntries.findIndex(entry => entry.type === selectedTopLevelSearchEntry?.type), pickerMaxVisible, (entry, index) => {
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
                                        <Box marginTop={1} paddingLeft={DESCRIPTION_INDENT}>
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
                                    {renderWindowedList(pickerCategories, selectedPickerCategory === null ? -1 : pickerCategories.indexOf(selectedPickerCategory), pickerMaxVisible, (category, index) => {
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
                                {renderWindowedList(pickerEntries, pickerEntries.findIndex(entry => entry.type === selectedPickerEntry?.type), pickerMaxVisible, (entry, index) => {
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
                                    <Box marginTop={1} paddingLeft={DESCRIPTION_INDENT}>
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
                                const numberFormatModifierText = widgetImpl?.supportsNumberFormat?.()
                                    ? getNumberFormatModifierText(widget)
                                    : undefined;
                                const hideModifierText = widgetImpl ? getHideModifierText(widget, widgetImpl.getHideableStates?.() ?? []) : undefined;
                                const labelModifierText = !widget.rawValue && widgetImpl?.getLabelPrefix?.(widget) !== undefined
                                    ? getLabelModifierText(widget)
                                    : undefined;

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
                                        {numberFormatModifierText && (
                                            <Text dimColor>
                                                {' '}
                                                {numberFormatModifierText}
                                            </Text>
                                        )}
                                        {hideModifierText && (
                                            <Text dimColor>
                                                {' '}
                                                {hideModifierText}
                                            </Text>
                                        )}
                                        {labelModifierText && (
                                            <Text dimColor>
                                                {' '}
                                                {labelModifierText}
                                            </Text>
                                        )}
                                        {supportsRawValue && widget.rawValue && <Text dimColor> (raw value)</Text>}
                                        {widget.merge === true && <Text dimColor> (merged→)</Text>}
                                        {widget.merge === 'no-padding' && <Text dimColor> (merged-no-pad→)</Text>}
                                        {widget.excludeFromAutoAlign && settings.powerline.enabled && settings.powerline.autoAlign && !isMergedIntoPreviousWidget(widgets, index) && <Text dimColor> (no-align)</Text>}
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
