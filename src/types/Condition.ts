// Operator types as string literals for JSON serialization compatibility

export type NumericOperator
    = 'equals'
        | 'greaterThan'
        | 'greaterThanOrEqual'
        | 'lessThan'
        | 'lessThanOrEqual';

export type StringOperator
    = 'equals'
        | 'contains'
        | 'startsWith'
        | 'endsWith';

export type BooleanOperator
    = 'equals';

export type ExistenceOperator
    = 'isNull'
        | 'isNotNull';

export type Operator = NumericOperator | StringOperator | BooleanOperator | ExistenceOperator;

// Operator arrays for classification and filtering

export const NUMERIC_OPERATORS: NumericOperator[] = [
    'equals',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual'
];

export const STRING_OPERATORS: StringOperator[] = [
    'equals',
    'contains',
    'startsWith',
    'endsWith'
];

export const BOOLEAN_OPERATORS: BooleanOperator[] = [
    'equals'
];

export const EXISTENCE_OPERATORS: ExistenceOperator[] = [
    'isNull',
    'isNotNull'
];

export const ALL_OPERATORS: Operator[] = [
    ...NUMERIC_OPERATORS,
    ...STRING_OPERATORS,
    ...BOOLEAN_OPERATORS,
    ...EXISTENCE_OPERATORS
];

// Deduplicated list of unique operator strings (since 'equals' appears in multiple categories)
const UNIQUE_OPERATORS: string[] = [...new Set(ALL_OPERATORS)];

// Display labels for each operator (for the condition editor UI)
export const OPERATOR_LABELS: Record<Operator, string> = {
    // Numeric / String / Boolean (shared)
    equals: 'equals',
    greaterThan: 'greater than',
    greaterThanOrEqual: 'greater than or equal',
    lessThan: 'less than',
    lessThanOrEqual: 'less than or equal',
    // String
    contains: 'contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    // Existence
    isNull: 'is null',
    isNotNull: 'is not null'
};

// Condition interface for typed access
export interface Condition {
    widget: string;
    operator: Operator;
    value: string | number | boolean | null;
    not?: boolean;
}

// Value type used to determine available operators
export type ConditionValueType = 'string' | 'number' | 'boolean' | 'unknown';

// --- Helper functions for reading condition fields from loosely-typed records ---

/** Get the widget reference from a condition record (defaults to 'self') */
export function getConditionWidget(when: Record<string, unknown>): string {
    const widget = when.widget;
    return typeof widget === 'string' ? widget : 'self';
}

/** Get the operator from a condition record by scanning for known operator keys */
export function getConditionOperator(when: Record<string, unknown>): Operator | null {
    for (const op of UNIQUE_OPERATORS) {
        if (op in when) {
            return op as Operator;
        }
    }
    return null;
}

/** Get the value associated with the operator in a condition record */
export function getConditionValue(when: Record<string, unknown>): string | number | boolean | null {
    const op = getConditionOperator(when);
    if (!op) {
        return null;
    }
    return when[op] as string | number | boolean | null;
}

/** Get the negation flag from a condition record (defaults to false) */
export function getConditionNot(when: Record<string, unknown>): boolean {
    const not = when.not;
    return typeof not === 'boolean' ? not : false;
}

// --- Operator classification type guards ---

export function isNumericOperator(op: Operator): op is NumericOperator {
    return NUMERIC_OPERATORS.includes(op as NumericOperator);
}

export function isStringOperator(op: Operator): op is StringOperator {
    return STRING_OPERATORS.includes(op as StringOperator);
}

export function isBooleanOperator(op: Operator): op is BooleanOperator {
    return BOOLEAN_OPERATORS.includes(op as BooleanOperator);
}

export function isExistenceOperator(op: Operator): op is ExistenceOperator {
    return EXISTENCE_OPERATORS.includes(op as ExistenceOperator);
}

// --- Operator filtering by value type ---

/** Get available operators for a given value type */
export function getOperatorsForValueType(valueType: ConditionValueType): Operator[] {
    switch (valueType) {
        case 'number':
            return [...NUMERIC_OPERATORS, ...EXISTENCE_OPERATORS];
        case 'string':
            return [...STRING_OPERATORS, ...EXISTENCE_OPERATORS];
        case 'boolean':
            return [...BOOLEAN_OPERATORS, ...EXISTENCE_OPERATORS];
        default:
            // For unknown/undefined, default to string + existence operators
            return [...STRING_OPERATORS, ...EXISTENCE_OPERATORS];
    }
}
