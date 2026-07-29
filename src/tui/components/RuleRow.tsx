import {
    Box,
    Text
} from 'ink';
import React from 'react';

import {
    OPERATOR_LABELS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    isExistenceOperator
} from '../../types/Condition';
import type {
    Rule,
    RuleApply
} from '../../types/Widget';

/** The human-readable form of a rule's condition, e.g. "when context-percentage greater than 80". */
export function formatConditionText(when: Record<string, unknown>): string {
    const widget = getConditionWidget(when);
    const operator = getConditionOperator(when);

    if (!operator) {
        return 'when (invalid condition)';
    }

    const prefix = getConditionNot(when) ? `when ${widget} NOT` : `when ${widget}`;
    const operatorLabel = OPERATOR_LABELS[operator];

    if (isExistenceOperator(operator)) {
        return `${prefix} ${operatorLabel}`;
    }

    return `${prefix} ${operatorLabel} ${String(getConditionValue(when))}`;
}

/** The properties a rule overrides, e.g. "color: red, bold: true". Empty when it overrides nothing. */
export function formatApplyProperties(apply: RuleApply): string {
    // Typed as unknown because a settings file can carry a key that is present but undefined,
    // which the inferred RuleApply type does not admit.
    const entries: [string, unknown][] = Object.entries(apply);

    return entries
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ');
}

export interface RuleRowProps {
    rule: Rule;
    isSelected: boolean;
    /**
     * The condition text already painted with the colour this rule renders in, so a rule row
     * previews its own styling the way a widget row does. Selection stays on the marker.
     */
    styledCondition?: string;
}

/** One rule beneath its widget in the accordion, shown the same way in both editor modes. */
export const RuleRow: React.FC<RuleRowProps> = ({ rule, isSelected, styledCondition }) => {
    const color = isSelected ? 'cyan' : 'gray';
    const applyText = formatApplyProperties(rule.apply);

    return (
        <Box paddingLeft={5} flexDirection='row' flexWrap='nowrap'>
            <Text color={color}>{isSelected ? '› ' : '  '}</Text>
            <Text color={styledCondition ? undefined : color}>
                {styledCondition ?? formatConditionText(rule.when)}
            </Text>
            {applyText && (
                <Text color={color} dimColor={!isSelected}>
                    {` -> ${applyText}`}
                </Text>
            )}
            {rule.stop && (
                <Text color={isSelected ? 'red' : 'gray'} dimColor={!isSelected}>
                    {' [STOP]'}
                </Text>
            )}
        </Box>
    );
};
