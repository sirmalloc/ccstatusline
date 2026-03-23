import {
    DISPLAY_OPERATOR_LABELS,
    OPERATOR_LABELS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    getDisplayOperator,
    isBooleanOperator,
    isSetOperator,
    isStringOperator
} from '../../../types/Condition';
import type { WidgetItem } from '../../../types/Widget';
import { mergeWidgetWithRuleApply } from '../../../utils/widget-properties';
import { getWidget } from '../../../utils/widgets';

/**
 * Format a rule condition into a human-readable summary string.
 *
 * Handles display operators (notEquals, notContains, etc.) and base operators
 * with optional NOT prefix.
 */
export function formatCondition(when: Record<string, unknown>): string {
    const widgetRef = getConditionWidget(when);
    const operator = getConditionOperator(when);
    const value = getConditionValue(when);
    const notFlag = getConditionNot(when);

    // Get widget display name
    let widgetName = 'self';
    if (widgetRef !== 'self') {
        const widgetImpl = getWidget(widgetRef);
        widgetName = widgetImpl ? widgetImpl.getDisplayName() : widgetRef;
    }

    // Check if this matches a display operator pattern
    const displayOp = getDisplayOperator(when);
    if (displayOp) {
        const displayLabel = DISPLAY_OPERATOR_LABELS[displayOp];

        // Format based on display operator type
        if (displayOp === 'notEquals') {
            if (typeof value === 'string') {
                return `when ${widgetName} ${displayLabel} "${value}"`;
            }
            return `when ${widgetName} ${displayLabel} ${value}`;
        }
        if (displayOp === 'notContains' || displayOp === 'notStartsWith' || displayOp === 'notEndsWith') {
            return `when ${widgetName} ${displayLabel} "${value}"`;
        }
        return `when ${widgetName} ${displayLabel}`;
    }

    // Fall back to showing base operator with NOT prefix if needed
    const notPrefix = notFlag ? 'NOT ' : '';

    if (operator && value !== null) {
        const opLabel = OPERATOR_LABELS[operator];

        // Format based on operator type
        if (isStringOperator(operator)) {
            return `when ${notPrefix}${widgetName} ${opLabel} "${value}"`;
        }

        if (isBooleanOperator(operator)) {
            return `when ${notPrefix}${widgetName} ${opLabel}`;
        }

        if (isSetOperator(operator) && Array.isArray(value)) {
            const valueList = value.map(v => JSON.stringify(v)).join(', ');
            return `when ${notPrefix}${widgetName} ${opLabel} [${valueList}]`;
        }

        // Numeric or equals
        return `when ${notPrefix}${widgetName} ${opLabel}${value}`;
    }

    return `when ${JSON.stringify(when)}`;
}

/**
 * Format applied properties as labels using the widget's own display logic.
 *
 * Creates a temp widget by merging base widget with rule.apply, then uses
 * the widget's getEditorDisplay to format modifier text alongside base
 * property labels (raw value, merge, hidden, character).
 */
export function formatAppliedProperties(
    apply: Record<string, unknown>,
    baseWidget: WidgetItem
): string {
    // Create a temp widget by merging base widget with rule.apply
    // Use shared merge function to handle metadata deep merge correctly
    const tempWidget = mergeWidgetWithRuleApply(baseWidget, apply);

    // Let the widget format its own modifiers (hide, remaining, etc.)
    const widgetImpl = getWidget(baseWidget.type);
    const { modifierText } = widgetImpl?.getEditorDisplay(tempWidget) ?? { modifierText: undefined };

    // Build labels for base properties (rawValue, merge)
    const baseLabels: string[] = [];

    if (tempWidget.rawValue) {
        baseLabels.push('raw value');
    }

    if (tempWidget.merge === true) {
        baseLabels.push('merged→');
    } else if (tempWidget.merge === 'no-padding') {
        baseLabels.push('merged-no-pad→');
    }

    if (tempWidget.hide) {
        baseLabels.push('hidden');
    }

    if (tempWidget.character !== undefined) {
        baseLabels.push(`character: ${tempWidget.character}`);
    }

    // Combine widget-specific modifiers and base property labels
    const parts: string[] = [];
    if (modifierText) {
        parts.push(modifierText);
    }
    if (baseLabels.length > 0) {
        parts.push(...baseLabels.map(l => `(${l})`));
    }

    return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}