// Operator types
export type NumericOperator =
    | 'greaterThan'
    | 'lessThan'
    | 'equals'
    | 'greaterThanOrEqual'
    | 'lessThanOrEqual';

export type StringOperator =
    | 'contains'
    | 'startsWith'
    | 'endsWith';

export type BooleanOperator =
    | 'isTrue';

export type SetOperator =
    | 'in'
    | 'notIn';

export type Operator = NumericOperator | StringOperator | BooleanOperator | SetOperator;

export const NUMERIC_OPERATORS: NumericOperator[] = [
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'equals'
];

export const STRING_OPERATORS: StringOperator[] = [
    'contains',
    'startsWith',
    'endsWith'
];

export const BOOLEAN_OPERATORS: BooleanOperator[] = [
    'isTrue'
];

export const SET_OPERATORS: SetOperator[] = [
    'in',
    'notIn'
];

export const ALL_OPERATORS: Operator[] = [
    ...NUMERIC_OPERATORS,
    ...STRING_OPERATORS,
    ...BOOLEAN_OPERATORS,
    ...SET_OPERATORS
];

// Display labels for operators
export const OPERATOR_LABELS: Record<Operator, string> = {
    // Numeric
    greaterThan: '>',
    greaterThanOrEqual: '≥',
    lessThan: '<',
    lessThanOrEqual: '≤',
    equals: '=',
    // String
    contains: 'contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    // Boolean
    isTrue: 'is true',
    // Set
    in: 'in',
    notIn: 'not in'
};

// Display-only operators - syntactic sugar that maps to base operator + not flag
export type DisplayOperator =
    | 'notEquals'           // equals + not
    | 'notContains'         // contains + not
    | 'notStartsWith'       // startsWith + not
    | 'notEndsWith'         // endsWith + not
    | 'isFalse';            // isTrue: false (special case, not using not flag)

export const DISPLAY_OPERATOR_LABELS: Record<DisplayOperator, string> = {
    notEquals: '≠',
    notContains: 'does not contain',
    notStartsWith: 'does not start with',
    notEndsWith: 'does not end with',
    isFalse: 'is false'
};

// Map display operators to their base operator + not flag
export const DISPLAY_OPERATOR_CONFIG: Record<DisplayOperator, { operator: Operator; not?: boolean; value?: boolean }> = {
    notEquals: { operator: 'equals', not: true },
    notContains: { operator: 'contains', not: true },
    notStartsWith: { operator: 'startsWith', not: true },
    notEndsWith: { operator: 'endsWith', not: true },
    isFalse: { operator: 'isTrue', value: false }  // Special: isTrue with value false
};

// Get display operator if condition matches a display operator pattern
export function getDisplayOperator(when: Record<string, unknown>): DisplayOperator | null {
    const operator = getConditionOperator(when);
    const notFlag = getConditionNot(when);
    const value = when[operator!];

    if (operator === 'equals' && notFlag) return 'notEquals';
    if (operator === 'contains' && notFlag) return 'notContains';
    if (operator === 'startsWith' && notFlag) return 'notStartsWith';
    if (operator === 'endsWith' && notFlag) return 'notEndsWith';
    if (operator === 'isTrue' && value === false) return 'isFalse';

    return null;
}

// Helper to get widget reference from condition (defaults to 'self')
export function getConditionWidget(when: Record<string, unknown>): string {
    const widget = when.widget;
    return typeof widget === 'string' ? widget : 'self';
}

// Helper to get negation flag from condition (defaults to false)
export function getConditionNot(when: Record<string, unknown>): boolean {
    const not = when.not;
    return typeof not === 'boolean' ? not : false;
}

// Helper to get operator from condition
export function getConditionOperator(when: Record<string, unknown>): Operator | null {
    for (const op of ALL_OPERATORS) {
        if (op in when) return op;
    }
    return null;
}

// Helper to get value from condition (works for all operator types)
export function getConditionValue(when: Record<string, unknown>): number | string | boolean | Array<string | number> | null {
    const op = getConditionOperator(when);
    if (!op) return null;
    return when[op] as number | string | boolean | Array<string | number> | null;
}

// Type guards for operators
export function isNumericOperator(op: Operator): op is NumericOperator {
    return NUMERIC_OPERATORS.includes(op as NumericOperator);
}

export function isStringOperator(op: Operator): op is StringOperator {
    return STRING_OPERATORS.includes(op as StringOperator);
}

export function isBooleanOperator(op: Operator): op is BooleanOperator {
    return BOOLEAN_OPERATORS.includes(op as BooleanOperator);
}

export function isSetOperator(op: Operator): op is SetOperator {
    return SET_OPERATORS.includes(op as SetOperator);
}
