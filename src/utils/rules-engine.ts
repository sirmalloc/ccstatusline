import {
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    isBooleanOperator,
    isNumericOperator,
    isSetOperator,
    isStringOperator,
    type NumericOperator,
    type SetOperator,
    type StringOperator
} from '../types/Condition';
import type { RenderContext } from '../types/RenderContext';
import type { WidgetItem } from '../types/Widget';

import { mergeWidgetWithRuleApply } from './widget-properties';
import { getWidgetValue } from './widget-values';

/**
 * Evaluate a numeric condition against a value
 */
function evaluateNumericCondition(
    operator: NumericOperator,
    widgetValue: number,
    conditionValue: number
): boolean {
    switch (operator) {
        case 'greaterThan':
            return widgetValue > conditionValue;
        case 'greaterThanOrEqual':
            return widgetValue >= conditionValue;
        case 'lessThan':
            return widgetValue < conditionValue;
        case 'lessThanOrEqual':
            return widgetValue <= conditionValue;
        case 'equals':
            return widgetValue === conditionValue;
        default:
            return false;
    }
}

/**
 * Evaluate a string condition against a value
 */
function evaluateStringCondition(
    operator: StringOperator,
    widgetValue: string,
    conditionValue: string
): boolean {
    switch (operator) {
        case 'contains':
            return widgetValue.includes(conditionValue);
        case 'startsWith':
            return widgetValue.startsWith(conditionValue);
        case 'endsWith':
            return widgetValue.endsWith(conditionValue);
        default:
            return false;
    }
}

/**
 * Evaluate a boolean condition against a value
 * Supports type coercion: numbers and strings can be treated as booleans
 */
function evaluateBooleanCondition(
    widgetValue: boolean | number | string,
    conditionValue: boolean
): boolean {
    // Convert widget value to boolean
    let boolValue: boolean;
    if (typeof widgetValue === 'boolean') {
        boolValue = widgetValue;
    } else if (typeof widgetValue === 'number') {
        // Standard number-to-boolean conversion: 0 = false, non-zero = true
        boolValue = widgetValue !== 0;
    } else if (typeof widgetValue === 'string') {
        // Parse string "true"/"false"
        const lower = widgetValue.toLowerCase();
        if (lower === 'true') {
            boolValue = true;
        } else if (lower === 'false') {
            boolValue = false;
        } else {
            return false;  // String that isn't "true"/"false" can't be evaluated as boolean
        }
    } else {
        return false;
    }

    return boolValue === conditionValue;
}

/**
 * Evaluate a set condition against a value
 */
function evaluateSetCondition(
    operator: SetOperator,
    widgetValue: string | number,
    conditionValue: (string | number)[]
): boolean {
    switch (operator) {
        case 'in':
            return conditionValue.includes(widgetValue);
        case 'notIn':
            return !conditionValue.includes(widgetValue);
        default:
            return false;
    }
}

/**
 * Evaluate a single rule condition
 *
 * @param when - The condition to evaluate
 * @param currentWidget - The widget that owns the rule
 * @param allWidgetsInLine - All widgets in the current line (for cross-widget references)
 * @param context - The render context
 */
function evaluateCondition(
    when: Record<string, unknown>,
    currentWidget: WidgetItem,
    allWidgetsInLine: WidgetItem[],
    context: RenderContext
): boolean {
    const widgetRef = getConditionWidget(when);
    const operator = getConditionOperator(when);
    const conditionValue = getConditionValue(when);
    const notFlag = getConditionNot(when);

    if (!operator || conditionValue === null) {
        return false;  // Invalid condition
    }

    // Determine which widget to evaluate
    let targetWidget: WidgetItem;
    if (widgetRef === 'self') {
        targetWidget = currentWidget;
    } else {
        // Find first widget with matching type in the line
        const widgetInLine = allWidgetsInLine.find(w => w.type === widgetRef);

        if (widgetInLine) {
            targetWidget = widgetInLine;
        } else {
            // Widget not in line - create temporary instance for evaluation
            // This allows rules to reference any widget from the catalog
            targetWidget = {
                id: 'temp-rule-eval',
                type: widgetRef
            };
        }
    }

    // Get the target widget's value (generic - can be number, string, or boolean)
    const widgetValue = getWidgetValue(targetWidget.type, context, targetWidget);

    if (widgetValue === null) {
        return false;  // Widget has no evaluable value
    }

    // Route to appropriate evaluation function based on operator type
    let result: boolean;

    if (isNumericOperator(operator)) {
        if (typeof widgetValue !== 'number' || typeof conditionValue !== 'number') {
            return false;  // Type mismatch
        }
        result = evaluateNumericCondition(operator, widgetValue, conditionValue);
    } else if (isStringOperator(operator)) {
        if (typeof widgetValue !== 'string' || typeof conditionValue !== 'string') {
            return false;  // Type mismatch
        }
        result = evaluateStringCondition(operator, widgetValue, conditionValue);
    } else if (isBooleanOperator(operator)) {
        // Boolean operators support type coercion from numbers and strings
        if (typeof conditionValue !== 'boolean') {
            return false;  // Invalid condition value
        }
        result = evaluateBooleanCondition(widgetValue, conditionValue);
    } else if (isSetOperator(operator)) {
        if (!Array.isArray(conditionValue)) {
            return false;  // Invalid condition value
        }
        if (typeof widgetValue !== 'string' && typeof widgetValue !== 'number') {
            return false;  // Type mismatch
        }
        result = evaluateSetCondition(operator, widgetValue, conditionValue);
    } else {
        return false;  // Unknown operator type
    }

    // Apply negation if specified
    return notFlag ? !result : result;
}

/**
 * Apply rules to a widget and return merged properties
 *
 * Rules execute top-to-bottom. First matching rule with stop=true halts evaluation.
 * Returns the widget item with rule overrides applied.
 *
 * @param item - The widget to apply rules to
 * @param context - The render context
 * @param allWidgetsInLine - All widgets in the current line (for cross-widget conditions)
 */
export function applyRules(
    item: WidgetItem,
    context: RenderContext,
    allWidgetsInLine: WidgetItem[]
): WidgetItem {
    const rules = item.rules;
    if (!rules || rules.length === 0) {
        return item;  // No rules, return original
    }

    // Build merged properties starting with base item
    let mergedItem = { ...item };

    // Evaluate rules top-to-bottom
    for (const rule of rules) {
        const matches = evaluateCondition(rule.when, item, allWidgetsInLine, context);

        if (matches) {
            // Apply this rule's property overrides using deep merge for metadata
            mergedItem = mergeWidgetWithRuleApply(mergedItem, rule.apply);

            // Stop if rule has stop flag
            if (rule.stop) {
                break;
            }
        }
    }

    return mergedItem;
}