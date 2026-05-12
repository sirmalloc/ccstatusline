import {
    describe,
    expect,
    it
} from 'vitest';

import type { Operator } from '../Condition';
import {
    ALL_OPERATORS,
    BOOLEAN_OPERATORS,
    EXISTENCE_OPERATORS,
    NUMERIC_OPERATORS,
    OPERATOR_LABELS,
    STRING_OPERATORS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    getOperatorsForValueType,
    isBooleanOperator,
    isExistenceOperator,
    isNumericOperator,
    isStringOperator
} from '../Condition';

describe('Operator arrays', () => {
    it('numeric operators include expected values', () => {
        expect(NUMERIC_OPERATORS).toEqual([
            'equals',
            'greaterThan',
            'greaterThanOrEqual',
            'lessThan',
            'lessThanOrEqual'
        ]);
    });

    it('string operators include expected values', () => {
        expect(STRING_OPERATORS).toEqual([
            'equals',
            'contains',
            'startsWith',
            'endsWith'
        ]);
    });

    it('boolean operators include expected values', () => {
        expect(BOOLEAN_OPERATORS).toEqual(['equals']);
    });

    it('existence operators include expected values', () => {
        expect(EXISTENCE_OPERATORS).toEqual(['isNull', 'isNotNull']);
    });

    it('ALL_OPERATORS contains all operator arrays', () => {
        for (const op of NUMERIC_OPERATORS) {
            expect(ALL_OPERATORS).toContain(op);
        }
        for (const op of STRING_OPERATORS) {
            expect(ALL_OPERATORS).toContain(op);
        }
        for (const op of BOOLEAN_OPERATORS) {
            expect(ALL_OPERATORS).toContain(op);
        }
        for (const op of EXISTENCE_OPERATORS) {
            expect(ALL_OPERATORS).toContain(op);
        }
    });
});

describe('OPERATOR_LABELS', () => {
    it('has a label for every unique operator', () => {
        const uniqueOperators = new Set(ALL_OPERATORS);
        for (const op of uniqueOperators) {
            expect(OPERATOR_LABELS[op]).toBeDefined();
            expect(typeof OPERATOR_LABELS[op]).toBe('string');
        }
    });

    it('returns correct labels for numeric operators', () => {
        expect(OPERATOR_LABELS.equals).toBe('equals');
        expect(OPERATOR_LABELS.greaterThan).toBe('greater than');
        expect(OPERATOR_LABELS.greaterThanOrEqual).toBe('greater than or equal');
        expect(OPERATOR_LABELS.lessThan).toBe('less than');
        expect(OPERATOR_LABELS.lessThanOrEqual).toBe('less than or equal');
    });

    it('returns correct labels for string operators', () => {
        expect(OPERATOR_LABELS.contains).toBe('contains');
        expect(OPERATOR_LABELS.startsWith).toBe('starts with');
        expect(OPERATOR_LABELS.endsWith).toBe('ends with');
    });

    it('returns correct labels for existence operators', () => {
        expect(OPERATOR_LABELS.isNull).toBe('is null');
        expect(OPERATOR_LABELS.isNotNull).toBe('is not null');
    });
});

describe('getConditionWidget', () => {
    it('returns widget string from condition record', () => {
        expect(getConditionWidget({ widget: 'context-percentage' })).toBe('context-percentage');
    });

    it('defaults to "self" when widget is missing', () => {
        expect(getConditionWidget({})).toBe('self');
    });

    it('defaults to "self" when widget is not a string', () => {
        expect(getConditionWidget({ widget: 42 })).toBe('self');
        expect(getConditionWidget({ widget: true })).toBe('self');
        expect(getConditionWidget({ widget: null })).toBe('self');
    });
});

describe('getConditionOperator', () => {
    it('finds numeric operators in condition record', () => {
        expect(getConditionOperator({ greaterThan: 80 })).toBe('greaterThan');
        expect(getConditionOperator({ lessThanOrEqual: 50 })).toBe('lessThanOrEqual');
    });

    it('finds string operators in condition record', () => {
        expect(getConditionOperator({ contains: 'main' })).toBe('contains');
        expect(getConditionOperator({ startsWith: 'feat/' })).toBe('startsWith');
    });

    it('finds boolean operators in condition record', () => {
        expect(getConditionOperator({ equals: true })).toBe('equals');
    });

    it('finds existence operators in condition record', () => {
        expect(getConditionOperator({ isNull: true })).toBe('isNull');
        expect(getConditionOperator({ isNotNull: true })).toBe('isNotNull');
    });

    it('returns null when no operator is found', () => {
        expect(getConditionOperator({})).toBeNull();
        expect(getConditionOperator({ widget: 'test', not: true })).toBeNull();
    });

    it('ignores non-operator keys', () => {
        expect(getConditionOperator({ widget: 'test', not: false, foo: 'bar' })).toBeNull();
    });
});

describe('getConditionValue', () => {
    it('returns numeric value for numeric operators', () => {
        expect(getConditionValue({ greaterThan: 80 })).toBe(80);
    });

    it('returns string value for string operators', () => {
        expect(getConditionValue({ contains: 'main' })).toBe('main');
    });

    it('returns boolean value for boolean operators', () => {
        expect(getConditionValue({ equals: true })).toBe(true);
        expect(getConditionValue({ equals: false })).toBe(false);
    });

    it('returns value for existence operators', () => {
        expect(getConditionValue({ isNull: true })).toBe(true);
    });

    it('returns null when no operator is found', () => {
        expect(getConditionValue({})).toBeNull();
    });
});

describe('getConditionNot', () => {
    it('returns true when not flag is true', () => {
        expect(getConditionNot({ not: true })).toBe(true);
    });

    it('returns false when not flag is false', () => {
        expect(getConditionNot({ not: false })).toBe(false);
    });

    it('defaults to false when not flag is missing', () => {
        expect(getConditionNot({})).toBe(false);
    });

    it('defaults to false when not flag is not a boolean', () => {
        expect(getConditionNot({ not: 'yes' })).toBe(false);
        expect(getConditionNot({ not: 1 })).toBe(false);
        expect(getConditionNot({ not: null })).toBe(false);
    });
});

describe('Operator type guards', () => {
    it('isNumericOperator identifies numeric operators', () => {
        expect(isNumericOperator('greaterThan')).toBe(true);
        expect(isNumericOperator('lessThan')).toBe(true);
        expect(isNumericOperator('greaterThanOrEqual')).toBe(true);
        expect(isNumericOperator('lessThanOrEqual')).toBe(true);
        expect(isNumericOperator('equals')).toBe(true);
    });

    it('isNumericOperator rejects non-numeric operators', () => {
        expect(isNumericOperator('contains' as Operator)).toBe(false);
        expect(isNumericOperator('isNull' as Operator)).toBe(false);
    });

    it('isStringOperator identifies string operators', () => {
        expect(isStringOperator('contains')).toBe(true);
        expect(isStringOperator('startsWith')).toBe(true);
        expect(isStringOperator('endsWith')).toBe(true);
        expect(isStringOperator('equals')).toBe(true);
    });

    it('isStringOperator rejects non-string operators', () => {
        expect(isStringOperator('greaterThan' as Operator)).toBe(false);
        expect(isStringOperator('isNotNull' as Operator)).toBe(false);
    });

    it('isBooleanOperator identifies boolean operators', () => {
        expect(isBooleanOperator('equals')).toBe(true);
    });

    it('isBooleanOperator rejects non-boolean operators', () => {
        expect(isBooleanOperator('contains' as Operator)).toBe(false);
        expect(isBooleanOperator('isNull' as Operator)).toBe(false);
    });

    it('isExistenceOperator identifies existence operators', () => {
        expect(isExistenceOperator('isNull')).toBe(true);
        expect(isExistenceOperator('isNotNull')).toBe(true);
    });

    it('isExistenceOperator rejects non-existence operators', () => {
        expect(isExistenceOperator('equals' as Operator)).toBe(false);
        expect(isExistenceOperator('contains' as Operator)).toBe(false);
    });

    it('equals is classified as numeric, string, and boolean', () => {
        const op: Operator = 'equals';
        expect(isNumericOperator(op)).toBe(true);
        expect(isStringOperator(op)).toBe(true);
        expect(isBooleanOperator(op)).toBe(true);
        expect(isExistenceOperator(op)).toBe(false);
    });
});

describe('getOperatorsForValueType', () => {
    it('returns numeric + existence operators for number type', () => {
        const ops = getOperatorsForValueType('number');
        expect(ops).toEqual([...NUMERIC_OPERATORS, ...EXISTENCE_OPERATORS]);
    });

    it('returns string + existence operators for string type', () => {
        const ops = getOperatorsForValueType('string');
        expect(ops).toEqual([...STRING_OPERATORS, ...EXISTENCE_OPERATORS]);
    });

    it('returns boolean + existence operators for boolean type', () => {
        const ops = getOperatorsForValueType('boolean');
        expect(ops).toEqual([...BOOLEAN_OPERATORS, ...EXISTENCE_OPERATORS]);
    });

    it('returns string + existence operators for unknown type', () => {
        const ops = getOperatorsForValueType('unknown');
        expect(ops).toEqual([...STRING_OPERATORS, ...EXISTENCE_OPERATORS]);
    });

    it('number operators include equals', () => {
        const ops = getOperatorsForValueType('number');
        expect(ops).toContain('equals');
    });

    it('all value types include existence operators', () => {
        for (const valueType of ['string', 'number', 'boolean', 'unknown'] as const) {
            const ops = getOperatorsForValueType(valueType);
            expect(ops).toContain('isNull');
            expect(ops).toContain('isNotNull');
        }
    });
});
