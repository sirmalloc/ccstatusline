import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useEffect,
    useState
} from 'react';

import {
    OPERATOR_LABELS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    isExistenceOperator
} from '../../types/Condition';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetItem,
    WidgetItemType
} from '../../types/Widget';
import { getBackgroundColorsForPowerline } from '../../utils/colors';
import { generateGuid } from '../../utils/guid';
import { canDetectTerminalWidth } from '../../utils/terminal';
import {
    filterWidgetCatalog,
    getMatchSegments,
    getWidget,
    getWidgetCatalog,
    getWidgetCatalogCategories
} from '../../utils/widgets';
import {
    collapse as collapseAccordion,
    getRuleCount,
    isExpanded as isAccordionExpanded,
    reconcile,
    selectRule as selectAccordionRule,
    toggleExpand as toggleExpandAccordion,
    type AccordionState
} from '../hooks/useRuleAccordion';

import { ConditionEditor } from './ConditionEditor';
import { ConfirmDialog } from './ConfirmDialog';
import {
    handleMoveInputMode,
    handleNormalInputMode,
    handlePickerInputMode,
    handleRuleInputMode,
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
    onTabSwap?: () => void;
    onWidgetHighlight?: (widgetId: string | null) => void;
    initialWidgetId?: string | null;
    accordionState?: AccordionState;
    onAccordionChange?: (state: AccordionState) => void;
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({ widgets, onUpdate, onBack, lineNumber, settings, onTabSwap, onWidgetHighlight, initialWidgetId, accordionState: accordionStateProp, onAccordionChange }) => {
    const [selectedIndex, setSelectedIndex] = useState(() => {
        if (initialWidgetId) {
            const index = widgets.findIndex(w => w.id === initialWidgetId);
            return index >= 0 ? index : 0;
        }
        return 0;
    });
    const [moveMode, setMoveMode] = useState(false);
    const [customEditorWidget, setCustomEditorWidget] = useState<CustomEditorWidgetState | null>(null);
    const [widgetPicker, setWidgetPicker] = useState<WidgetPickerState | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [conditionEditorState, setConditionEditorState] = useState<{ ruleIndex: number } | null>(null);
    const [pendingConditionEditorOpen, setPendingConditionEditorOpen] = useState(false);
    const [localAccordion, setLocalAccordion] = useState<AccordionState>(
        () => accordionStateProp ?? { expandedWidgetId: null, selectedRuleIndex: 0 }
    );
    const accordion = accordionStateProp ?? localAccordion;
    const separatorChars = ['|', '-', ',', ' '];

    useEffect(() => {
        if (onWidgetHighlight) {
            const currentWidget = widgets[selectedIndex];
            onWidgetHighlight(currentWidget?.id ?? null);
        }
    }, [selectedIndex, widgets, onWidgetHighlight]);

    // Reconcile accordion state when widgets change (e.g. widget deleted)
    useEffect(() => {
        setLocalAccordion((prev) => {
            const reconciled = reconcile(prev, widgets);
            if (
                reconciled.expandedWidgetId !== prev.expandedWidgetId
                || reconciled.selectedRuleIndex !== prev.selectedRuleIndex
            ) {
                if (onAccordionChange) {
                    onAccordionChange(reconciled);
                }
                return reconciled;
            }
            return prev;
        });
    }, [widgets, onAccordionChange]);

    // Auto-open condition editor for newly added rules
    useEffect(() => {
        if (pendingConditionEditorOpen) {
            setPendingConditionEditorOpen(false);
            setConditionEditorState({ ruleIndex: accordion.selectedRuleIndex });
        }
    }, [pendingConditionEditorOpen, accordion.selectedRuleIndex]);

    const setAccordion = (state: AccordionState) => {
        setLocalAccordion(state);
        if (onAccordionChange) {
            onAccordionChange(state);
        }
    };

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
        // Skip input if condition editor is active - it handles its own input
        if (conditionEditorState) {
            return;
        }

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

        // Route to rule-level input when accordion is expanded for the selected widget
        const selectedWidget = widgets[selectedIndex];
        if (
            accordion.expandedWidgetId !== null
            && accordion.expandedWidgetId === selectedWidget?.id
        ) {
            handleRuleInputMode({
                input,
                key,
                widgets,
                selectedIndex,
                selectedRuleIndex: accordion.selectedRuleIndex,
                onUpdate: (updatedWidgets: WidgetItem[]) => {
                    onUpdate(updatedWidgets);
                    // Check if this was an add operation (rule count increased)
                    const oldRuleCount = selectedWidget.rules?.length ?? 0;
                    const newWidget = updatedWidgets[selectedIndex];
                    const newRuleCount = newWidget?.rules?.length ?? 0;
                    if (newRuleCount > oldRuleCount) {
                        setPendingConditionEditorOpen(true);
                    }
                },
                onCollapse: () => {
                    setAccordion(collapseAccordion());
                },
                onSelectRule: (index: number) => {
                    setAccordion(selectAccordionRule(accordion, index));
                },
                onEditCondition: (ruleIndex: number) => {
                    setConditionEditorState({ ruleIndex });
                }
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
            getUniqueBackgroundColor,
            onTabSwap,
            onToggleAccordion: () => {
                const w = widgets[selectedIndex];
                if (w) {
                    setAccordion(toggleExpandAccordion(accordion, w.id));
                }
            }
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

    const formatConditionText = (when: Record<string, unknown>): string => {
        const widget = getConditionWidget(when);
        const operator = getConditionOperator(when);
        const negated = getConditionNot(when);

        if (!operator) {
            return 'when (invalid condition)';
        }

        const operatorLabel = OPERATOR_LABELS[operator];
        const existenceOp = isExistenceOperator(operator);

        if (existenceOp) {
            const prefix = negated ? `when ${widget} NOT` : `when ${widget}`;
            return `${prefix} ${operatorLabel}`;
        }

        const value = getConditionValue(when);
        const prefix = negated ? `when ${widget} NOT` : `when ${widget}`;
        return `${prefix} ${operatorLabel} ${String(value)}`;
    };

    const formatApplyProperties = (apply: Record<string, unknown>): string => {
        const parts: string[] = [];
        for (const [key, val] of Object.entries(apply)) {
            if (val !== undefined) {
                const display = typeof val === 'object' && val !== null
                    ? JSON.stringify(val)
                    : String(val as string | number | boolean | null);
                parts.push(`${key}: ${display}`);
            }
        }
        return parts.join(', ');
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
    const isColorable = Boolean(
        currentWidget
        && !isSeparator
        && !isFlexSeparator
        && getWidget(currentWidget.type)?.supportsColors(currentWidget)
    );
    const hasWidgets = widgets.length > 0;
    const isRuleMode = accordion.expandedWidgetId !== null
        && accordion.expandedWidgetId === currentWidget?.id;
    const isNonSeparatorWidget = currentWidget && !isSeparator && !isFlexSeparator;

    // Build main help text (without custom keybinds)
    let helpText: string;
    if (isRuleMode) {
        const currentRules = currentWidget.rules ?? [];
        const ruleHelpParts = ['↑↓ select rule', '(a)dd'];
        if (currentRules.length > 0) {
            ruleHelpParts.push('(d)elete', '(s)top', '(e)dit/Enter condition');
        }
        if (currentRules.length > 1) {
            ruleHelpParts.push('(j)/(k) reorder');
        }
        ruleHelpParts.push('ESC collapse');
        helpText = ruleHelpParts.join(', ');
    } else {
        helpText = hasWidgets
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
        if (isNonSeparatorWidget) {
            helpText += ', (x) rules';
        }
        if (isColorable && onTabSwap) {
            helpText += ', ⇥ edit colors';
        }
        helpText += ', ESC back';
    }

    // Build custom keybinds text
    const customKeybindsText = customKeybinds.map(kb => kb.label).join(', ');
    const pickerActionLabel = widgetPicker?.action === 'add'
        ? 'Add Widget'
        : widgetPicker?.action === 'insert'
            ? 'Insert Widget'
            : 'Change Widget Type';

    // If condition editor is active, render it as an overlay
    if (conditionEditorState !== null) {
        const targetWidget = widgets[selectedIndex];
        const targetRule = targetWidget?.rules?.[conditionEditorState.ruleIndex];
        return (
            <ConditionEditor
                widgetType={targetWidget?.type ?? ''}
                condition={targetRule?.when ?? {}}
                settings={settings}
                onSave={(condition) => {
                    const newWidgets = [...widgets];
                    const widget = newWidgets[selectedIndex];
                    if (widget) {
                        const newRules = [...(widget.rules ?? [])];
                        const existingRule = newRules[conditionEditorState.ruleIndex];
                        if (existingRule) {
                            newRules[conditionEditorState.ruleIndex] = { ...existingRule, when: condition };
                            newWidgets[selectedIndex] = { ...widget, rules: newRules };
                            onUpdate(newWidgets);
                        }
                    }
                    setConditionEditorState(null);
                }}
                onCancel={() => {
                    setConditionEditorState(null);
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
                                const ruleCount = getRuleCount(widget);
                                const widgetExpanded = isAccordionExpanded(accordion, widget.id);

                                return (
                                    <React.Fragment key={widget.id}>
                                        <Box flexDirection='row' flexWrap='nowrap'>
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
                                            {ruleCount > 0 && (
                                                <Text color='yellow'>
                                                    {' '}
                                                    {`[${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'}]`}
                                                </Text>
                                            )}
                                        </Box>
                                        {widgetExpanded && (
                                            <Box flexDirection='column'>
                                                {ruleCount === 0 ? (
                                                    <Box paddingLeft={5}>
                                                        <Text dimColor>No rules</Text>
                                                    </Box>
                                                ) : (
                                                    widget.rules?.map((rule, ruleIndex) => {
                                                        const isRuleSelected = ruleIndex === accordion.selectedRuleIndex;
                                                        const conditionText = formatConditionText(rule.when);
                                                        const applyText = formatApplyProperties(rule.apply);
                                                        return (
                                                            <Box key={ruleIndex} paddingLeft={5} flexDirection='row' flexWrap='nowrap'>
                                                                <Text color={isRuleSelected ? 'cyan' : 'gray'}>
                                                                    {isRuleSelected ? '› ' : '  '}
                                                                </Text>
                                                                <Text color={isRuleSelected ? 'cyan' : 'gray'}>
                                                                    {conditionText}
                                                                </Text>
                                                                {applyText && (
                                                                    <Text color={isRuleSelected ? 'cyan' : 'gray'} dimColor={!isRuleSelected}>
                                                                        {` -> ${applyText}`}
                                                                    </Text>
                                                                )}
                                                                {rule.stop && (
                                                                    <Text color={isRuleSelected ? 'red' : 'gray'} dimColor={!isRuleSelected}>
                                                                        {' [STOP]'}
                                                                    </Text>
                                                                )}
                                                            </Box>
                                                        );
                                                    })
                                                )}
                                            </Box>
                                        )}
                                    </React.Fragment>
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
