import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import {
    OPERATOR_LABELS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    getOperatorsForValueType,
    isBooleanOperator,
    isExistenceOperator,
    isNumericOperator,
    isStringOperator,
    type ConditionValueType,
    type Operator
} from '../../types/Condition';
import type { Settings } from '../../types/Settings';
import {
    filterWidgetCatalog,
    getMatchSegments,
    getWidget,
    getWidgetCatalog,
    getWidgetCatalogCategories
} from '../../utils/widgets';

import {
    handlePickerInputMode,
    normalizePickerState,
    type WidgetPickerState
} from './items-editor/input-handlers';

export interface ConditionEditorProps {
    widgetType: string;
    condition: Record<string, unknown>;
    settings: Settings;
    onSave: (condition: Record<string, unknown>) => void;
    onCancel: () => void;
}

type EditorField = 'widget' | 'operator' | 'value';

export const ConditionEditor: React.FC<ConditionEditorProps> = ({
    widgetType,
    condition,
    settings,
    onSave,
    onCancel
}) => {
    const initialOp = getConditionOperator(condition) ?? 'greaterThan';
    const initialValue = getConditionValue(condition);
    const initialWidget = getConditionWidget(condition);
    const initialNot = getConditionNot(condition);

    const [selectedWidget, setSelectedWidget] = useState(initialWidget);
    const [operator, setOperator] = useState<Operator>(initialOp);
    const [valueInput, setValueInput] = useState(() => {
        if (initialValue === null) {
            return '50';
        }
        return String(initialValue);
    });
    const [notFlag, setNotFlag] = useState(initialNot);
    const [field, setField] = useState<EditorField>('widget');
    const [widgetPicker, setWidgetPicker] = useState<WidgetPickerState | null>(null);
    const [operatorIndex, setOperatorIndex] = useState<number | null>(null);

    const widgetCatalog = getWidgetCatalog(settings);
    const widgetCategories = ['All', ...getWidgetCatalogCategories(widgetCatalog)];

    // Determine the value type for the selected widget
    const getSelectedValueType = (): ConditionValueType => {
        const targetType = selectedWidget === 'self' ? widgetType : selectedWidget;
        const widgetImpl = getWidget(targetType);
        return widgetImpl?.getValueType?.() ?? 'unknown';
    };

    // Get available operators for the current widget's value type
    const getAvailableOperators = (): Operator[] => {
        return getOperatorsForValueType(getSelectedValueType());
    };

    // Open widget picker
    const openWidgetPicker = () => {
        if (widgetCatalog.length === 0) {
            return;
        }

        setWidgetPicker(normalizePickerState({
            action: 'change',
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: selectedWidget === 'self' ? null : selectedWidget
        }, widgetCatalog, widgetCategories));
    };

    // Apply widget selection from picker
    const applyWidgetPickerSelection = (selectedType: string) => {
        setSelectedWidget(selectedType);
        setWidgetPicker(null);

        // Reset operator if current one is incompatible with the new widget's value type
        const widgetImpl = getWidget(selectedType);
        const valueType: ConditionValueType = widgetImpl?.getValueType?.() ?? 'unknown';
        const available = getOperatorsForValueType(valueType);
        if (!available.includes(operator)) {
            const fallback = available[0];
            if (fallback) {
                setOperator(fallback);
            }
        }
    };

    // Open operator picker (inline list)
    const openOperatorPicker = () => {
        const available = getAvailableOperators();
        const currentIndex = available.indexOf(operator);
        setOperatorIndex(Math.max(0, currentIndex));
    };

    // Get widget display name
    const getWidgetDisplayName = (type: string): string => {
        if (type === 'self') {
            return 'This widget (self)';
        }
        const widgetImpl = getWidget(type);
        return widgetImpl ? widgetImpl.getDisplayName() : type;
    };

    // Check if value is valid for the current operator
    const isValueValid = (): boolean => {
        if (isExistenceOperator(operator)) {
            return true;
        }
        if (isBooleanOperator(operator)) {
            return valueInput.toLowerCase() === 'true' || valueInput.toLowerCase() === 'false';
        }
        if (isNumericOperator(operator)) {
            return !isNaN(Number(valueInput)) && valueInput.trim().length > 0;
        }
        // String operators
        return valueInput.trim().length > 0;
    };

    // Build the condition record from current state
    const buildCondition = (): Record<string, unknown> | null => {
        if (!isValueValid()) {
            return null;
        }

        const result: Record<string, unknown> = {};

        // Only include widget if it's not 'self'
        if (selectedWidget !== 'self') {
            result.widget = selectedWidget;
        }

        // Include not flag if true
        if (notFlag) {
            result.not = true;
        }

        // Set operator and value
        if (isExistenceOperator(operator)) {
            result[operator] = true;
        } else if (isBooleanOperator(operator)) {
            result[operator] = valueInput.toLowerCase() === 'true';
        } else if (isNumericOperator(operator)) {
            result[operator] = Number(valueInput);
        } else {
            // String operator
            result[operator] = valueInput.trim();
        }

        return result;
    };

    // Navigate between fields
    const navigateField = (direction: 'left' | 'right') => {
        const fields: EditorField[] = isExistenceOperator(operator)
            ? ['widget', 'operator']
            : ['widget', 'operator', 'value'];

        const currentIndex = fields.indexOf(field);
        if (direction === 'right') {
            const nextIndex = (currentIndex + 1) % fields.length;
            const nextField = fields[nextIndex];
            if (nextField) {
                setField(nextField);
            }
        } else {
            const nextIndex = (currentIndex - 1 + fields.length) % fields.length;
            const nextField = fields[nextIndex];
            if (nextField) {
                setField(nextField);
            }
        }
    };

    useInput((input, key) => {
        // Widget picker takes over input
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

        // Operator picker takes over input
        if (operatorIndex !== null) {
            const available = getAvailableOperators();

            if (key.escape) {
                setOperatorIndex(null);
            } else if (key.upArrow) {
                const newIndex = operatorIndex - 1 < 0 ? available.length - 1 : operatorIndex - 1;
                setOperatorIndex(newIndex);
            } else if (key.downArrow) {
                const newIndex = operatorIndex + 1 >= available.length ? 0 : operatorIndex + 1;
                setOperatorIndex(newIndex);
            } else if (key.return) {
                const selectedOp = available[operatorIndex];
                if (selectedOp) {
                    setOperator(selectedOp);

                    // If switching to an existence operator, move field away from value
                    if (isExistenceOperator(selectedOp) && field === 'value') {
                        setField('operator');
                    }

                    // Reset value for boolean operators
                    if (isBooleanOperator(selectedOp) && !isBooleanOperator(operator)) {
                        setValueInput('true');
                    }
                }
                setOperatorIndex(null);
            }
            return;
        }

        // Main field-level input handling
        if (key.escape) {
            onCancel();
            return;
        }

        if (key.return) {
            const result = buildCondition();
            if (result) {
                onSave(result);
            }
            return;
        }

        // Negation toggle
        if (input === 'n' && !key.ctrl && !key.meta && field !== 'value') {
            setNotFlag(!notFlag);
            return;
        }

        if (key.leftArrow && field !== 'value') {
            navigateField('left');
            return;
        }

        if (key.rightArrow && field !== 'value') {
            navigateField('right');
            return;
        }

        if (key.tab) {
            navigateField('right');
            return;
        }

        // Field-specific input
        if (field === 'widget') {
            if (key.upArrow || key.downArrow) {
                openWidgetPicker();
            }
        } else if (field === 'operator') {
            if (key.upArrow || key.downArrow) {
                openOperatorPicker();
            }
        } else {
            // field === 'value'
            if (key.leftArrow) {
                navigateField('left');
            } else if (key.rightArrow) {
                navigateField('right');
            } else if (key.backspace || key.delete) {
                setValueInput(valueInput.slice(0, -1));
            } else if (isBooleanOperator(operator)) {
                // Toggle true/false on any keypress
                if (input === 't' || input === 'f') {
                    setValueInput(input === 't' ? 'true' : 'false');
                }
            } else if (input && !key.ctrl && !key.meta) {
                setValueInput(valueInput + input);
            }
        }
    });

    // --- Rendering ---

    const widgetLabel = getWidgetDisplayName(selectedWidget);
    const opLabel = OPERATOR_LABELS[operator];
    const valid = isValueValid();

    // Render operator picker overlay
    if (operatorIndex !== null) {
        const available = getAvailableOperators();

        return (
            <Box flexDirection='column' borderStyle='round' borderColor='cyan' padding={1}>
                <Box marginBottom={1}>
                    <Text bold>Select Operator</Text>
                </Box>

                <Text dimColor>↑↓ select, Enter apply, ESC cancel</Text>

                <Box marginTop={1} flexDirection='column'>
                    {available.map((op, idx) => {
                        const isSelected = idx === operatorIndex;
                        const label = OPERATOR_LABELS[op];
                        return (
                            <Text key={op} color={isSelected ? 'green' : undefined}>
                                {isSelected ? '▶ ' : '  '}
                                {label}
                            </Text>
                        );
                    })}
                </Box>
            </Box>
        );
    }

    // Render widget picker overlay
    if (widgetPicker) {
        const selectedPickerCategory = widgetPicker.selectedCategory ?? (widgetCategories[0] ?? 'All');
        const hasTopLevelSearch = widgetPicker.level === 'category' && widgetPicker.categoryQuery.trim().length > 0;
        const topLevelSearchEntries = hasTopLevelSearch
            ? filterWidgetCatalog(widgetCatalog, 'All', widgetPicker.categoryQuery)
            : [];
        const selectedTopLevelSearchEntry = topLevelSearchEntries.find(
            entry => entry.type === widgetPicker.selectedType
        ) ?? topLevelSearchEntries[0];
        const pickerEntries = filterWidgetCatalog(
            widgetCatalog,
            selectedPickerCategory,
            widgetPicker.widgetQuery
        );
        const selectedPickerEntry = pickerEntries.find(
            entry => entry.type === widgetPicker.selectedType
        ) ?? pickerEntries[0];

        return (
            <Box flexDirection='column' borderStyle='round' borderColor='cyan' padding={1}>
                <Box marginBottom={1}>
                    <Text bold>Select Widget to Evaluate</Text>
                </Box>

                {widgetPicker.level === 'category' ? (
                    <>
                        {hasTopLevelSearch ? (
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
                                {selectedPickerCategory}
                                {' '}
                                | Search:
                                {' '}
                            </Text>
                            <Text color='cyan'>{widgetPicker.widgetQuery || '(none)'}</Text>
                        </Box>
                    </>
                )}

                <Box marginTop={1} flexDirection='column'>
                    {widgetPicker.level === 'category' ? (
                        hasTopLevelSearch ? (
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
                            widgetCategories.length === 0 ? (
                                <Text dimColor>No categories available.</Text>
                            ) : (
                                widgetCategories.map((category, index) => {
                                    const filteredCategories = widgetCategories;
                                    const isSelected = category === (widgetPicker.selectedCategory ?? filteredCategories[0]);
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
                                })
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
            </Box>
        );
    }

    // Render main condition editor
    const valueType = getSelectedValueType();
    const fieldHints: Record<EditorField, string> = {
        widget: '↑↓ open widget picker, ←→/Tab switch field, (n)egate, Enter save, ESC cancel',
        operator: '↑↓ open operator picker, ←→/Tab switch field, (n)egate, Enter save, ESC cancel',
        value: isStringOperator(operator)
            ? 'type text, ←→ switch field, Tab switch field, Enter save, ESC cancel'
            : isBooleanOperator(operator)
                ? '(t)rue/(f)alse, ←→ switch field, Tab switch field, Enter save, ESC cancel'
                : 'type number, ←→ switch field, Tab switch field, Enter save, ESC cancel'
    };

    return (
        <Box flexDirection='column' borderStyle='round' borderColor='cyan' padding={1}>
            <Box marginBottom={1}>
                <Text bold>Edit Condition</Text>
                {notFlag && <Text color='red' bold> [NEGATED]</Text>}
            </Box>

            <Box marginBottom={1}>
                <Text>when </Text>
                <Text color={field === 'widget' ? 'cyan' : undefined} bold={field === 'widget'}>
                    {widgetLabel}
                </Text>
                <Text> </Text>
                <Text color={field === 'operator' ? 'cyan' : undefined} bold={field === 'operator'}>
                    {opLabel}
                </Text>
                {!isExistenceOperator(operator) && (
                    <>
                        <Text> </Text>
                        <Text color={field === 'value' ? 'cyan' : undefined} bold={field === 'value'}>
                            {isStringOperator(operator) && `"${valueInput || '(empty)'}"`}
                            {isBooleanOperator(operator) && (valueInput || '(empty)')}
                            {isNumericOperator(operator) && (valueInput || '(empty)')}
                        </Text>
                    </>
                )}
                {!valid && <Text color='red'> (invalid)</Text>}
            </Box>

            <Box marginBottom={1}>
                <Text dimColor>
                    {fieldHints[field]}
                </Text>
            </Box>

            <Box>
                <Text dimColor>
                    {'Value type: '}
                    {valueType}
                    {' | Operators available: '}
                    {getAvailableOperators().length}
                </Text>
            </Box>
        </Box>
    );
};
