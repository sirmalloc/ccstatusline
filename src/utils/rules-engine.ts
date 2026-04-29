import {
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    isBooleanOperator,
    isExistenceOperator,
    isNumericOperator,
    isStringOperator,
    type ExistenceOperator,
    type NumericOperator,
    type StringOperator
} from '../types/Condition';
import type { RenderContext } from '../types/RenderContext';
import type {
    RuleApply,
    WidgetItem
} from '../types/Widget';

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
        case 'equals':
            return widgetValue === conditionValue;
        default:
            return false;
    }
}

/**
 * Evaluate a boolean condition against a value.
 *
 * Only matches when both widgetValue and conditionValue are booleans.
 */
function evaluateBooleanCondition(
    widgetValue: boolean,
    conditionValue: boolean
): boolean {
    return widgetValue === conditionValue;
}

/**
 * Evaluate an existence condition against a value.
 *
 * isNull matches when the value is null.
 * isNotNull matches when the value is not null.
 */
function evaluateExistenceCondition(
    operator: ExistenceOperator,
    widgetValue: number | string | boolean | null
): boolean {
    switch (operator) {
        case 'isNull':
            return widgetValue === null;
        case 'isNotNull':
            return widgetValue !== null;
        default:
            return false;
    }
}

/**
 * Evaluate a single rule condition
 *
 * @param when - The condition to evaluate (loosely-typed record from JSON)
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

    // A rule with no recognized operator does not match
    if (!operator) {
        return false;
    }

    // Existence operators don't require a condition value
    // but non-existence operators with null condition value are invalid
    if (!isExistenceOperator(operator) && conditionValue === null) {
        return false;
    }

    // Determine which widget to evaluate
    let targetWidget: WidgetItem;
    if (widgetRef === 'self') {
        targetWidget = currentWidget;
    } else {
        // Find first widget with matching type in the line
        const widgetInLine = allWidgetsInLine.find(w => w.type === widgetRef);
        if (!widgetInLine) {
            // Widget not found in the line -- condition evaluates to false
            return false;
        }
        targetWidget = widgetInLine;
    }

    // Get the target widget's value
    const widgetValue = getWidgetValue(targetWidget.type, context, targetWidget);

    // Route existence operators first (they handle null values)
    if (isExistenceOperator(operator)) {
        const result = evaluateExistenceCondition(operator, widgetValue);
        return notFlag ? !result : result;
    }

    // For all other operators, null widget value means the condition cannot match
    if (widgetValue === null) {
        return false;
    }

    let result: boolean;

    // 'equals' is shared between numeric, string, and boolean -- route by value types
    if (operator === 'equals') {
        if (typeof widgetValue === 'string' && typeof conditionValue === 'string') {
            result = widgetValue === conditionValue;
        } else if (typeof widgetValue === 'number' && typeof conditionValue === 'number') {
            result = widgetValue === conditionValue;
        } else if (typeof widgetValue === 'boolean' && typeof conditionValue === 'boolean') {
            result = evaluateBooleanCondition(widgetValue, conditionValue);
        } else {
            // Type mismatch
            return false;
        }
    } else if (isNumericOperator(operator)) {
        if (typeof widgetValue !== 'number' || typeof conditionValue !== 'number') {
            return false;
        }
        result = evaluateNumericCondition(operator, widgetValue, conditionValue);
    } else if (isStringOperator(operator)) {
        if (typeof widgetValue !== 'string' || typeof conditionValue !== 'string') {
            return false;
        }
        result = evaluateStringCondition(operator, widgetValue, conditionValue);
    } else if (isBooleanOperator(operator)) {
        if (typeof widgetValue !== 'boolean' || typeof conditionValue !== 'boolean') {
            return false;
        }
        result = evaluateBooleanCondition(widgetValue, conditionValue);
    } else {
        // Unknown operator type
        return false;
    }

    return notFlag ? !result : result;
}

/**
 * Merge rule.apply onto a widget item, producing a new object.
 *
 * Only properties present in apply override the widget's properties.
 * Metadata is deep-merged so base widget metadata is preserved.
 * The original widget item is never mutated.
 */
function mergeApply(widget: WidgetItem, apply: RuleApply): WidgetItem {
    const merged = { ...widget, ...apply };

    // Deep merge metadata if both sides have it
    const applyRecord = apply as Record<string, unknown>;
    const applyMetadata = applyRecord.metadata;
    if (
        applyMetadata !== undefined
        && typeof applyMetadata === 'object'
        && applyMetadata !== null
        && widget.metadata
    ) {
        merged.metadata = {
            ...widget.metadata,
            ...(applyMetadata as Record<string, string>)
        };
    }

    return merged;
}

/**
 * Apply rules to a widget and return merged properties.
 *
 * Rules execute top-to-bottom. All matching rules' `apply` objects are merged
 * (later rules override earlier ones for the same property). A matching rule
 * with `stop: true` halts further evaluation.
 *
 * Returns a new widget item with rule overrides applied. The original item
 * is never mutated.
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
        return item;
    }

    let mergedItem = { ...item };

    for (const rule of rules) {
        const matches = evaluateCondition(rule.when, item, allWidgetsInLine, context);

        if (matches) {
            mergedItem = mergeApply(mergedItem, rule.apply);

            if (rule.stop) {
                break;
            }
        }
    }

    return mergedItem;
}
