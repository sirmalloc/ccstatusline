import {
    describe,
    expect,
    test
} from 'vitest';

import {
    DISPLAY_OPERATOR_LABELS,
    OPERATOR_LABELS,
    getConditionOperator,
    getConditionValue,
    getDisplayOperator
} from '../Condition';

describe('Condition utilities', () => {
    test('getConditionOperator extracts operator', () => {
        // Numeric operators
        expect(getConditionOperator({ greaterThan: 50 })).toBe('greaterThan');
        expect(getConditionOperator({ lessThan: 100 })).toBe('lessThan');
        expect(getConditionOperator({ equals: 42 })).toBe('equals');
        expect(getConditionOperator({ greaterThanOrEqual: 75 })).toBe('greaterThanOrEqual');
        expect(getConditionOperator({ lessThanOrEqual: 25 })).toBe('lessThanOrEqual');

        // String operators
        expect(getConditionOperator({ contains: 'text' })).toBe('contains');
        expect(getConditionOperator({ startsWith: 'prefix' })).toBe('startsWith');
        expect(getConditionOperator({ endsWith: 'suffix' })).toBe('endsWith');

        // Boolean operators
        expect(getConditionOperator({ isTrue: true })).toBe('isTrue');

        // Set operators
        expect(getConditionOperator({ in: ['a', 'b'] })).toBe('in');
        expect(getConditionOperator({ notIn: ['x', 'y'] })).toBe('notIn');

        // No operator
        expect(getConditionOperator({})).toBeNull();
    });

    test('getConditionValue extracts value (supports multiple types)', () => {
        // Numeric values
        expect(getConditionValue({ greaterThan: 50 })).toBe(50);
        expect(getConditionValue({ lessThan: 100.5 })).toBe(100.5);
        expect(getConditionValue({ equals: 0 })).toBe(0);
        expect(getConditionValue({ greaterThanOrEqual: -10 })).toBe(-10);
        expect(getConditionValue({ lessThanOrEqual: 99.99 })).toBe(99.99);

        // String values
        expect(getConditionValue({ contains: 'feature/' })).toBe('feature/');
        expect(getConditionValue({ startsWith: 'prefix' })).toBe('prefix');

        // Boolean values
        expect(getConditionValue({ isTrue: true })).toBe(true);
        expect(getConditionValue({ isTrue: false })).toBe(false);

        // Array values
        expect(getConditionValue({ in: ['a', 'b', 'c'] })).toEqual(['a', 'b', 'c']);

        // No operator
        expect(getConditionValue({})).toBeNull();
    });

    test('all operators have labels', () => {
        expect(OPERATOR_LABELS.greaterThan).toBe('>');
        expect(OPERATOR_LABELS.greaterThanOrEqual).toBe('≥');
        expect(OPERATOR_LABELS.lessThan).toBe('<');
        expect(OPERATOR_LABELS.lessThanOrEqual).toBe('≤');
        expect(OPERATOR_LABELS.equals).toBe('=');
    });

    test('handles invalid conditions gracefully', () => {
        // Unknown operator
        expect(getConditionOperator({ unknown: 50 })).toBeNull();
        expect(getConditionValue({ unknown: 50 })).toBeNull();

        // Type mismatches are allowed in extraction (validated during evaluation)
        expect(getConditionValue({ greaterThan: 'not a number' })).toBe('not a number');
    });

    test('display operators - detects patterns', () => {
        // notEquals: equals + not
        expect(getDisplayOperator({ equals: 50, not: true })).toBe('notEquals');
        expect(getDisplayOperator({ equals: 50 })).toBeNull();

        // notContains: contains + not
        expect(getDisplayOperator({ contains: 'feature/', not: true })).toBe('notContains');
        expect(getDisplayOperator({ contains: 'feature/' })).toBeNull();

        // notStartsWith: startsWith + not
        expect(getDisplayOperator({ startsWith: 'prefix', not: true })).toBe('notStartsWith');

        // notEndsWith: endsWith + not
        expect(getDisplayOperator({ endsWith: 'suffix', not: true })).toBe('notEndsWith');

        // isFalse: isTrue with value false
        expect(getDisplayOperator({ isTrue: false })).toBe('isFalse');
        expect(getDisplayOperator({ isTrue: true })).toBeNull();
    });

    test('display operators have labels', () => {
        expect(DISPLAY_OPERATOR_LABELS.notEquals).toBe('≠');
        expect(DISPLAY_OPERATOR_LABELS.notContains).toBe('does not contain');
        expect(DISPLAY_OPERATOR_LABELS.notStartsWith).toBe('does not start with');
        expect(DISPLAY_OPERATOR_LABELS.notEndsWith).toBe('does not end with');
        expect(DISPLAY_OPERATOR_LABELS.isFalse).toBe('is false');
    });
});