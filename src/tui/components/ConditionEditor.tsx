import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import {
    DISPLAY_OPERATOR_CONFIG,
    DISPLAY_OPERATOR_LABELS,
    OPERATOR_LABELS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    getDisplayOperator,
    isBooleanOperator,
    isNumericOperator,
    isSetOperator,
    isStringOperator,
    type DisplayOperator,
    type Operator
} from '../../types/Condition';
import type { Settings } from '../../types/Settings';
import {
    filterWidgetCatalog,
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
    widgetType: string;  // For display name
    condition: Record<string, unknown>;
    settings: Settings;  // For widget catalog
    onSave: (condition: Record<string, unknown>) => void;
    onCancel: () => void;
}

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

    const [operator, setOperator] = useState<Operator>(initialOp);
    const [valueInput, setValueInput] = useState(() => {
        if (initialValue === null) {
            return '50';  // Default numeric value
        }
        if (Array.isArray(initialValue)) {
            return initialValue.map(v => String(v)).join(', ');
        }
        return String(initialValue);
    });
    const [selectedWidget, setSelectedWidget] = useState<string>(initialWidget);
    const [notFlag, setNotFlag] = useState<boolean>(initialNot);
    const [mode, setMode] = useState<'widget' | 'operator' | 'value'>('widget');
    const [widgetPicker, setWidgetPicker] = useState<WidgetPickerState | null>(null);
    const [operatorPicker, setOperatorPicker] = useState<{
        selectedIndex: number;
        category: 'Numeric' | 'String' | 'Boolean' | 'Set';
        selectedItem: Operator | DisplayOperator;
    } | null>(null);

    const widgetCatalog = getWidgetCatalog(settings);
    const widgetCategories = ['All', ...getWidgetCatalogCategories(widgetCatalog)];

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

    const applyWidgetPickerSelection = (selectedType: string) => {
        setSelectedWidget(selectedType);
        setWidgetPicker(null);
    };

    // Operator picker helpers
    const getOperatorCategory = (op: Operator | DisplayOperator): 'Numeric' | 'String' | 'Boolean' | 'Set' => {
        // Check if it's a display operator
        if (op in DISPLAY_OPERATOR_CONFIG) {
            const config = DISPLAY_OPERATOR_CONFIG[op as DisplayOperator];
            return getOperatorCategory(config.operator);
        }

        // Base operators
        if (isNumericOperator(op as Operator))
            return 'Numeric';
        if (isStringOperator(op as Operator))
            return 'String';
        if (isBooleanOperator(op as Operator))
            return 'Boolean';
        return 'Set';
    };

    const getOperatorsInCategory = (category: 'Numeric' | 'String' | 'Boolean' | 'Set'): (Operator | DisplayOperator)[] => {
        switch (category) {
            case 'Numeric':
                return ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'];
            case 'String':
                return ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'isEmpty', 'notEmpty'];
            case 'Boolean':
                return ['isTrue', 'isFalse'];
            case 'Set':
                return ['in', 'notIn'];
        }
    };

    const openOperatorPicker = () => {
        // Check if current condition matches a display operator
        const displayOp = getDisplayOperator(condition);
        const currentOp = displayOp ?? operator;

        const currentCategory = getOperatorCategory(currentOp);
        const operatorsInCategory = getOperatorsInCategory(currentCategory);
        const selectedIndex = operatorsInCategory.indexOf(currentOp);

        setOperatorPicker({
            selectedIndex: Math.max(0, selectedIndex),
            category: currentCategory,
            selectedItem: currentOp
        });
    };

    const applyOperatorPickerSelection = (selectedOp: Operator | DisplayOperator) => {
        // Check if it's a display operator
        if (selectedOp in DISPLAY_OPERATOR_CONFIG) {
            const config = DISPLAY_OPERATOR_CONFIG[selectedOp as DisplayOperator];
            setOperator(config.operator);

            if (config.not !== undefined) {
                setNotFlag(config.not);
            }

            if (config.value !== undefined) {
                // Special case: isFalse uses isTrue with value false
                setValueInput(String(config.value));
            }
        } else {
            // Base operator
            setOperator(selectedOp as Operator);
            setNotFlag(false);
        }

        setOperatorPicker(null);

        // Update value input based on new operator type (for base operators)
        const baseOp = selectedOp in DISPLAY_OPERATOR_CONFIG
            ? DISPLAY_OPERATOR_CONFIG[selectedOp as DisplayOperator].operator
            : selectedOp as Operator;

        if (isBooleanOperator(baseOp)) {
            if (!(selectedOp in DISPLAY_OPERATOR_CONFIG && DISPLAY_OPERATOR_CONFIG[selectedOp as DisplayOperator].value !== undefined)) {
                setValueInput('true');
            }
        } else if (isSetOperator(baseOp)) {
            setValueInput('');
        } else if (isStringOperator(baseOp)) {
            setValueInput('');
        }
        // Keep numeric value as-is for numeric operators
    };

    useInput((input, key) => {
        // Handle widget picker input
        if (widgetPicker) {
            handlePickerInputMode({
                input,
                key,
                widgetPicker,
                setWidgetPicker,
                widgetCatalog,
                widgetCategories,
                applyWidgetPickerSelection
            });
            return;
        }

        // Handle operator picker input
        if (operatorPicker) {
            const categories: ('Numeric' | 'String' | 'Boolean' | 'Set')[] = ['Numeric', 'String', 'Boolean', 'Set'];
            const operatorsInCategory = getOperatorsInCategory(operatorPicker.category);

            if (key.escape) {
                setOperatorPicker(null);
            } else if (key.leftArrow || key.rightArrow) {
                // Switch category
                const currentCategoryIndex = categories.indexOf(operatorPicker.category);
                const nextCategoryIndex = key.rightArrow
                    ? (currentCategoryIndex + 1) % categories.length
                    : (currentCategoryIndex - 1 + categories.length) % categories.length;
                const newCategory = categories[nextCategoryIndex] ?? categories[0];
                if (!newCategory) {
                    setOperatorPicker(null);
                    return;
                }
                const newOps = getOperatorsInCategory(newCategory);
                const firstOperator = newOps[0];
                if (!firstOperator) {
                    setOperatorPicker(null);
                    return;
                }

                setOperatorPicker({
                    category: newCategory,
                    selectedIndex: 0,
                    selectedItem: firstOperator
                });
            } else if (key.upArrow) {
                const newIndex = Math.max(0, operatorPicker.selectedIndex - 1);
                const selectedItem = operatorsInCategory[newIndex];
                if (!selectedItem) {
                    return;
                }
                setOperatorPicker({
                    ...operatorPicker,
                    selectedIndex: newIndex,
                    selectedItem
                });
            } else if (key.downArrow) {
                const newIndex = Math.min(operatorsInCategory.length - 1, operatorPicker.selectedIndex + 1);
                const selectedItem = operatorsInCategory[newIndex];
                if (!selectedItem) {
                    return;
                }
                setOperatorPicker({
                    ...operatorPicker,
                    selectedIndex: newIndex,
                    selectedItem
                });
            } else if (key.return) {
                applyOperatorPickerSelection(operatorPicker.selectedItem);
            }
            return;
        }

        if (key.escape) {
            onCancel();
        } else if (key.return) {
            // Save condition - parse value based on operator type
            const newCondition: Record<string, unknown> = {};

            // Only include widget if it's not 'self'
            if (selectedWidget !== 'self') {
                newCondition.widget = selectedWidget;
            }

            // Include not flag if true
            if (notFlag) {
                newCondition.not = true;
            }

            // Parse and validate value based on operator type
            if (isBooleanOperator(operator)) {
                const boolValue = valueInput.toLowerCase() === 'true';
                newCondition[operator] = boolValue;
                onSave(newCondition);
            } else if (isSetOperator(operator)) {
                // Parse comma-separated values
                const values = valueInput
                    .split(',')
                    .map(v => v.trim())
                    .filter(v => v.length > 0)
                    .map((v) => {
                        // Try to parse as number, otherwise keep as string
                        const num = Number(v);
                        return isNaN(num) ? v : num;
                    });

                if (values.length > 0) {
                    newCondition[operator] = values;
                    onSave(newCondition);
                }
                // Don't save if empty
            } else if (isStringOperator(operator)) {
                // String value - no parsing needed
                if (valueInput.trim().length > 0) {
                    newCondition[operator] = valueInput.trim();
                    onSave(newCondition);
                }
                // Don't save if empty
            } else {
                // Numeric operator
                const numValue = Number(valueInput);
                if (!isNaN(numValue)) {
                    newCondition[operator] = numValue;
                    onSave(newCondition);
                }
                // Don't save if invalid number
            }
        } else if (key.leftArrow) {
            // Navigate fields left (cycles): value → operator → widget → value
            if (mode === 'value') {
                setMode('operator');
            } else if (mode === 'operator') {
                setMode('widget');
            } else {
                setMode('value');  // Wrap around
            }
        } else if (key.rightArrow) {
            // Navigate fields right (cycles): widget → operator → value → widget
            if (mode === 'widget') {
                setMode('operator');
            } else if (mode === 'operator') {
                setMode('value');
            } else {
                setMode('widget');  // Wrap around
            }
        } else if (key.upArrow || key.downArrow) {
            // Open pickers with up/down
            if (mode === 'widget') {
                openWidgetPicker();
            } else if (mode === 'operator') {
                openOperatorPicker();
            }
            // In value mode, up/down does nothing (no picker)
        } else if (mode === 'value') {
            if (key.backspace || key.delete) {
                setValueInput(valueInput.slice(0, -1));
            } else if (input) {
                // Allow different input based on operator type
                if (isBooleanOperator(operator)) {
                    // Toggle true/false
                    if (input === 't' || input === 'f') {
                        setValueInput(input === 't' ? 'true' : 'false');
                    }
                } else {
                    // For string, numeric, and set operators, allow any character
                    setValueInput(valueInput + input);
                }
            }
        }
    });

    // Check if current state matches a display operator
    // Parse the value to its proper type so display operator detection works correctly
    // (valueInput is always a string, but operators like isTrue need boolean values)
    const parsedValue = isBooleanOperator(operator)
        ? valueInput.toLowerCase() === 'true'
        : valueInput;
    const currentCondition = {
        [operator]: parsedValue,
        ...(notFlag ? { not: true } : {}),
        ...(selectedWidget !== 'self' ? { widget: selectedWidget } : {})
    };
    const displayOp = getDisplayOperator(currentCondition);
    const opLabel = displayOp ? DISPLAY_OPERATOR_LABELS[displayOp] : OPERATOR_LABELS[operator];

    // Validate value based on operator type
    const isValid = (() => {
        if (isBooleanOperator(operator)) {
            return valueInput.toLowerCase() === 'true' || valueInput.toLowerCase() === 'false';
        }
        if (isSetOperator(operator)) {
            return valueInput.trim().length > 0;
        }
        if (isStringOperator(operator)) {
            return valueInput.trim().length > 0;
        }
        // Numeric operator
        return !isNaN(Number(valueInput));
    })();

    // Get widget display name
    const getWidgetDisplayName = (widgetType: string): string => {
        if (widgetType === 'self') {
            return 'This widget (self)';
        }
        const widgetImpl = getWidget(widgetType);
        return widgetImpl ? widgetImpl.getDisplayName() : widgetType;
    };

    const widgetLabel = getWidgetDisplayName(selectedWidget);

    // Render operator picker if open
    if (operatorPicker) {
        const categories: ('Numeric' | 'String' | 'Boolean' | 'Set')[] = ['Numeric', 'String', 'Boolean', 'Set'];
        const operatorsInCategory = getOperatorsInCategory(operatorPicker.category);

        return (
            <Box flexDirection='column' borderStyle='round' borderColor='cyan' padding={1}>
                <Box marginBottom={1}>
                    <Text bold>Select Operator</Text>
                </Box>

                {/* Category navigation bar */}
                <Box marginBottom={1}>
                    <Text dimColor>← </Text>
                    {categories.map((cat, idx) => {
                        const isActive = cat === operatorPicker.category;
                        return (
                            <React.Fragment key={cat}>
                                {idx > 0 && <Text dimColor>  </Text>}
                                <Text color={isActive ? 'cyan' : undefined} bold={isActive}>
                                    {isActive ? `[${cat}]` : cat}
                                </Text>
                            </React.Fragment>
                        );
                    })}
                    <Text dimColor> →</Text>
                </Box>

                <Text dimColor>↑↓ select, ←→ switch category, Enter apply, ESC cancel</Text>

                <Box marginTop={1} flexDirection='column'>
                    {operatorsInCategory.map((op, idx) => {
                        const isSelected = idx === operatorPicker.selectedIndex;
                        // Get label from either base operators or display operators
                        const label = (op in DISPLAY_OPERATOR_LABELS)
                            ? DISPLAY_OPERATOR_LABELS[op as DisplayOperator]
                            : OPERATOR_LABELS[op as Operator];

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

    // Render widget picker if open
    if (widgetPicker) {
        const selectedPickerCategory = widgetPicker.selectedCategory ?? (widgetCategories[0] ?? 'All');
        const pickerCategories = widgetCategories.filter(c => c.toLowerCase().includes(widgetPicker.categoryQuery.toLowerCase())
        );
        const topLevelSearchEntries = widgetPicker.level === 'category' && widgetPicker.categoryQuery.trim().length > 0
            ? filterWidgetCatalog(widgetCatalog, 'All', widgetPicker.categoryQuery)
            : [];
        const selectedTopLevelSearchEntry = topLevelSearchEntries.find(entry => entry.type === widgetPicker.selectedType) ?? null;
        const pickerEntries = filterWidgetCatalog(widgetCatalog, selectedPickerCategory, widgetPicker.widgetQuery);
        const selectedPickerEntry = pickerEntries.find(entry => entry.type === widgetPicker.selectedType) ?? null;

        return (
            <Box flexDirection='column' borderStyle='round' borderColor='cyan' padding={1}>
                <Box marginBottom={1}>
                    <Text bold>Select Widget to Reference</Text>
                </Box>

                {widgetPicker.level === 'category' ? (
                    <>
                        {widgetPicker.categoryQuery.trim().length > 0 ? (
                            <Text dimColor>↑↓ select widget match, Enter apply, ESC clear/cancel</Text>
                        ) : (
                            <Text dimColor>↑↓ select category, Enter drill in, type to search</Text>
                        )}
                        <Box>
                            <Text dimColor>Search: </Text>
                            <Text color='cyan'>{widgetPicker.categoryQuery || '(none)'}</Text>
                        </Box>
                    </>
                ) : (
                    <>
                        <Text dimColor>↑↓ select widget, Enter apply, ESC back, type to search</Text>
                        <Box>
                            <Text dimColor>
                                Category:
                                {selectedPickerCategory}
                            </Text>
                        </Box>
                        <Box>
                            <Text dimColor>
                                Search:
                                {' '}
                            </Text>
                            <Text color='cyan'>{widgetPicker.widgetQuery || '(none)'}</Text>
                        </Box>
                    </>
                )}

                <Box marginTop={1} flexDirection='column'>
                    {widgetPicker.level === 'category' ? (
                        widgetPicker.categoryQuery.trim().length > 0 ? (
                            topLevelSearchEntries.length === 0 ? (
                                <Text dimColor>No widgets match the search.</Text>
                            ) : (
                                topLevelSearchEntries.map(entry => (
                                    <Text key={entry.type} color={selectedTopLevelSearchEntry?.type === entry.type ? 'green' : undefined}>
                                        {selectedTopLevelSearchEntry?.type === entry.type ? '▶ ' : '  '}
                                        {entry.displayName}
                                    </Text>
                                ))
                            )
                        ) : (
                            pickerCategories.map(cat => (
                                <Text key={cat} color={cat === selectedPickerCategory ? 'green' : undefined}>
                                    {cat === selectedPickerCategory ? '▶ ' : '  '}
                                    {cat}
                                </Text>
                            ))
                        )
                    ) : (
                        pickerEntries.length === 0 ? (
                            <Text dimColor>No widgets in this category match the search.</Text>
                        ) : (
                            pickerEntries.map(entry => (
                                <Text key={entry.type} color={selectedPickerEntry?.type === entry.type ? 'green' : undefined}>
                                    {selectedPickerEntry?.type === entry.type ? '▶ ' : '  '}
                                    {entry.displayName}
                                </Text>
                            ))
                        )
                    )}
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection='column' borderStyle='round' borderColor='cyan' padding={1}>
            <Box marginBottom={1}>
                <Text bold>Edit Condition</Text>
            </Box>

            <Box marginBottom={1}>
                <Text>when </Text>
                <Text color={mode === 'widget' ? 'cyan' : undefined} bold={mode === 'widget'}>
                    {widgetLabel}
                </Text>
                <Text> </Text>
                <Text color={mode === 'operator' ? 'cyan' : undefined} bold={mode === 'operator'}>
                    {opLabel}
                </Text>
                {!isBooleanOperator(operator) && (
                    <>
                        <Text> </Text>
                        <Text color={mode === 'value' ? 'cyan' : undefined} bold={mode === 'value'}>
                            {isStringOperator(operator) && `"${valueInput || '(empty)'}"`}
                            {isSetOperator(operator) && `[${valueInput || '(empty)'}]`}
                            {!isStringOperator(operator) && !isSetOperator(operator) && (valueInput || '(empty)')}
                        </Text>
                    </>
                )}
                {!isValid && <Text color='red'> (invalid)</Text>}
            </Box>

            <Box marginBottom={1}>
                <Text dimColor>
                    {mode === 'widget' && '↑↓ open widget picker, ←→ switch field, Enter save, ESC cancel'}
                    {mode === 'operator' && '↑↓ open operator picker, ←→ switch field, Enter save, ESC cancel'}
                    {mode === 'value' && isBooleanOperator(operator) && 't/f for true/false, ←→ switch field, Enter save, ESC cancel'}
                    {mode === 'value' && isSetOperator(operator) && 'type comma-separated values, ←→ switch field, Enter save, ESC cancel'}
                    {mode === 'value' && isStringOperator(operator) && 'type text, ←→ switch field, Enter save, ESC cancel'}
                    {mode === 'value' && !isBooleanOperator(operator) && !isSetOperator(operator) && !isStringOperator(operator) && 'type number, ←→ switch field, Enter save, ESC cancel'}
                </Text>
            </Box>
        </Box>
    );
};