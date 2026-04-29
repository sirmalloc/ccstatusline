import {
    beforeEach,
    describe,
    expect,
    test,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { WidgetItem } from '../../types/Widget';
import { applyRules } from '../rules-engine';
import * as widgetValuesModule from '../widget-values';

describe('Rules Engine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    const mockContext: RenderContext = {
        data: {
            context_window: {
                context_window_size: 200000,
                total_input_tokens: 150000,
                total_output_tokens: 10000,
                current_usage: null,
                used_percentage: 80,
                remaining_percentage: 20
            }
        }
    };

    // --- Basic rule evaluation ---

    test('returns original item when no rules', () => {
        const item: WidgetItem = {
            id: 'test',
            type: 'context-percentage',
            color: 'white'
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result).toEqual(item);
    });

    test('returns original item when rules array is empty', () => {
        const item: WidgetItem = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            rules: []
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result).toEqual(item);
    });

    test('applies color override when condition matches', () => {
        const item: WidgetItem = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'yellow' }
                }
            ]
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result.color).toBe('yellow');
    });

    test('keeps original color when condition does not match', () => {
        const item: WidgetItem = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 90 },
                    apply: { color: 'red' }
                }
            ]
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result.color).toBe('white');
    });

    test('applies multiple properties from one rule', () => {
        const item: WidgetItem = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            bold: false,
            rules: [
                {
                    when: { greaterThan: 75 },
                    apply: { color: 'red', bold: true }
                }
            ]
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result.color).toBe('red');
        expect(result.bold).toBe(true);
    });

    test('does not mutate the original item', () => {
        const item: WidgetItem = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'yellow' }
                }
            ]
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result.color).toBe('yellow');
        expect(item.color).toBe('white');
    });

    // --- Numeric operators ---

    describe('Numeric Operators', () => {
        test('all numeric operators evaluate correctly', () => {
            const testCases = [
                { operator: 'greaterThan', value: 70, expected: true },
                { operator: 'greaterThan', value: 80, expected: false },
                { operator: 'greaterThan', value: 90, expected: false },
                { operator: 'greaterThanOrEqual', value: 80, expected: true },
                { operator: 'greaterThanOrEqual', value: 81, expected: false },
                { operator: 'lessThan', value: 90, expected: true },
                { operator: 'lessThan', value: 80, expected: false },
                { operator: 'lessThan', value: 70, expected: false },
                { operator: 'lessThanOrEqual', value: 80, expected: true },
                { operator: 'lessThanOrEqual', value: 79, expected: false },
                { operator: 'equals', value: 80, expected: true },
                { operator: 'equals', value: 79, expected: false }
            ];

            for (const { operator, value, expected } of testCases) {
                const item: WidgetItem = {
                    id: 'test',
                    type: 'context-percentage',
                    color: 'white',
                    rules: [
                        {
                            when: { [operator]: value },
                            apply: { color: 'red' }
                        }
                    ]
                };

                const result = applyRules(item, mockContext, [item]);
                expect(result.color).toBe(expected ? 'red' : 'white');
            }
        });

        test('numeric operator with string widget value returns false (type mismatch)', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'custom-text',
                customText: '80',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // custom-text renders a string, not a number -- type mismatch
            expect(result.color).toBe('white');
        });

        test('numeric equals does not match string value', () => {
            // Mock getWidgetValue to return a string
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('80');

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { equals: 80 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('white');
        });
    });

    // --- String operators ---

    describe('String Operators', () => {
        test('contains operator matches substring', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('feature/advanced-operators');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { contains: 'feature' },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('contains operator does not match when substring absent', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('main');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { contains: 'feature' },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('startsWith operator matches prefix', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('feature/test');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { startsWith: 'feature/' },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('startsWith operator does not match wrong prefix', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('bugfix/test');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { startsWith: 'feature/' },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('endsWith operator matches suffix', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const item: WidgetItem = {
                id: 'test',
                type: 'model',
                color: 'white',
                rules: [
                    {
                        when: { endsWith: '4-6' },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, context, [item]);
            expect(result.bold).toBe(true);
        });

        test('endsWith operator does not match wrong suffix', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const item: WidgetItem = {
                id: 'test',
                type: 'model',
                color: 'white',
                rules: [
                    {
                        when: { endsWith: 'haiku' },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, context, [item]);
            expect(result.bold).toBeUndefined();
        });

        test('equals operator matches exact string', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('main');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { equals: 'main' },
                        apply: { color: 'cyan' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('cyan');
        });

        test('equals operator does not match different string', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('develop');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { equals: 'main' },
                        apply: { color: 'cyan' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('string operators fail on numeric widgets (type mismatch)', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { contains: '80' },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('white');
        });

        test('equals still works for numeric values', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { equals: 80 },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('green');
        });
    });

    // --- Boolean operators ---

    describe('Boolean Operators', () => {
        test('equals true matches boolean widget with true value', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(true);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-bool',
                color: 'white',
                rules: [
                    {
                        when: { equals: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('red');
        });

        test('equals true does not match boolean widget with false value', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(false);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-bool',
                color: 'white',
                rules: [
                    {
                        when: { equals: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('equals false matches boolean widget with false value', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(false);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-bool',
                color: 'white',
                rules: [
                    {
                        when: { equals: false },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('boolean equals does not match numeric value (type mismatch)', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(42);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { equals: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('boolean equals does not match string value (type mismatch)', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('true');

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { equals: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });
    });

    // --- Existence operators ---

    describe('Existence Operators', () => {
        test('isNull matches when widget value is null', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(null);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNull: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('gray');
        });

        test('isNull does not match when widget has a value', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('hello');

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNull: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('isNotNull matches when widget has a value', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(42);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNotNull: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('isNotNull does not match when widget value is null', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(null);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNotNull: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('isNull matches for widget with empty rendered output (null from getWidgetValue)', () => {
            // custom-text with no customText renders '' which getWidgetValue returns as null
            const item: WidgetItem = {
                id: 'test',
                type: 'custom-text',
                color: 'white',
                rules: [
                    {
                        when: { isNull: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('gray');
        });

        test('isNotNull matches string value', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('hello');

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNotNull: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('isNotNull matches boolean false (value exists but is false)', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(false);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNotNull: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('isNotNull matches zero (value exists but is 0)', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(0);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNotNull: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });
    });

    // --- Negation (NOT flag) ---

    describe('NOT Flag (Negation)', () => {
        test('NOT with numeric operator inverts result', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 90, not: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // Value is 80, NOT > 90 = true, condition matches
            expect(result.color).toBe('green');
        });

        test('NOT with numeric operator does not match when base condition is true', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 70, not: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // Value is 80, 80 > 70 = true, NOT true = false, does not match
            expect(result.color).toBe('white');
        });

        test('NOT with string equals acts as notEquals', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('develop');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { equals: 'main', not: true },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('yellow');
        });

        test('NOT with contains operator (notContains)', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('main');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { contains: 'feature/', not: true },
                        apply: { color: 'cyan' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // Branch is "main" which does NOT contain "feature/", so condition matches
            expect(result.color).toBe('cyan');
        });

        test('NOT with startsWith operator', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('bugfix/test');

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { startsWith: 'feature/', not: true },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('yellow');
        });

        test('NOT with boolean equals', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(false);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-bool',
                color: 'white',
                rules: [
                    {
                        when: { equals: true, not: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // value is false, equals true = false, NOT false = true, matches
            expect(result.color).toBe('green');
        });

        test('NOT with isNull inverts to isNotNull behavior', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('has-value');

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNull: true, not: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // isNull = false (has value), NOT false = true, matches
            expect(result.color).toBe('green');
        });

        test('NOT with isNotNull inverts to isNull behavior', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(null);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { isNotNull: true, not: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // isNotNull = false (null value), NOT false = true, matches
            expect(result.color).toBe('gray');
        });
    });

    // --- Multiple rules: stacking and stop flag ---

    describe('Multiple Rules (Stacking and Stop)', () => {
        test('evaluates rules top-to-bottom, later rules override', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'yellow' }
                    },
                    {
                        when: { greaterThan: 70 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('red');
        });

        test('respects stop flag -- stops after first matching stop rule', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'yellow' },
                        stop: true
                    },
                    {
                        when: { greaterThan: 70 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('yellow');
        });

        test('stop flag on non-matching rule does not stop evaluation', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 95 },
                        apply: { color: 'yellow' },
                        stop: true
                    },
                    {
                        when: { greaterThan: 70 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // First rule does not match (80 < 95), second matches
            expect(result.color).toBe('red');
        });

        test('accumulates properties from multiple matching rules', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                bold: false,
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'yellow' }
                    },
                    {
                        when: { greaterThan: 60 },
                        apply: { bold: true }
                    },
                    {
                        when: { greaterThan: 70 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // All three match: color yellow -> red (overridden), bold true
            expect(result.color).toBe('red');
            expect(result.bold).toBe(true);
        });

        test('mixed matching and non-matching rules', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'yellow' }
                    },
                    {
                        when: { greaterThan: 90 },
                        apply: { color: 'red' }
                    },
                    {
                        when: { lessThan: 85 },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // Rule 1 matches (80 > 50), rule 2 doesn't (80 < 90), rule 3 matches (80 < 85)
            expect(result.color).toBe('yellow');
            expect(result.bold).toBe(true);
        });

        test('multiple rules with mixed NOT flags', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 90, not: true },
                        apply: { color: 'green' }
                    },
                    {
                        when: { greaterThan: 70 },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // First: 80 is NOT > 90 = matches, applies green
            // Second: 80 > 70 = matches, applies bold
            expect(result.color).toBe('green');
            expect(result.bold).toBe(true);
        });
    });

    // --- Cross-widget conditions ---

    describe('Cross-Widget Conditions', () => {
        test('references another widget in the line by type', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockImplementation(
                (widgetType: string) => {
                    if (widgetType === 'context-percentage')
                        return 80;
                    if (widgetType === 'git-branch')
                        return 'feature/test';
                    return null;
                }
            );

            const gitBranchWidget: WidgetItem = {
                id: 'branch-1',
                type: 'git-branch',
                color: 'white'
            };

            const contextWidget: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', contains: 'feature' },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(contextWidget, mockContext, [gitBranchWidget, contextWidget]);
            expect(result.color).toBe('green');
        });

        test('cross-widget condition returns false when widget not in line', () => {
            const contextWidget: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', contains: 'feature' },
                        apply: { color: 'green' }
                    }
                ]
            };

            // No git-branch widget in the line
            const result = applyRules(contextWidget, mockContext, [contextWidget]);
            expect(result.color).toBe('white');
        });

        test('explicit self reference works', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'self', greaterThan: 50 },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('yellow');
        });

        test('implicit self reference (no widget property)', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('yellow');
        });

        test('cross-widget numeric condition', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockImplementation(
                (widgetType: string) => {
                    if (widgetType === 'context-percentage')
                        return 80;
                    return null;
                }
            );

            const item: WidgetItem = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'context-percentage', greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const contextWidget: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage'
            };

            const result = applyRules(item, mockContext, [item, contextWidget]);
            expect(result.color).toBe('red');
        });

        test('cross-widget boolean condition', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockImplementation(
                (widgetType: string) => {
                    if (widgetType === 'git-changes')
                        return true;
                    if (widgetType === 'context-percentage')
                        return 80;
                    return null;
                }
            );

            const gitChangesWidget: WidgetItem = {
                id: 'git-1',
                type: 'git-changes',
                color: 'white'
            };

            const contextWidget: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-changes', equals: true },
                        apply: { color: 'yellow', bold: true }
                    }
                ]
            };

            const result = applyRules(contextWidget, mockContext, [gitChangesWidget, contextWidget]);
            expect(result.color).toBe('yellow');
            expect(result.bold).toBe(true);
        });

        test('cross-widget existence condition', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockImplementation(
                (widgetType: string) => {
                    if (widgetType === 'git-branch')
                        return null;
                    if (widgetType === 'context-percentage')
                        return 80;
                    return null;
                }
            );

            const branchWidget: WidgetItem = {
                id: 'branch-1',
                type: 'git-branch'
            };

            const contextWidget: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', isNull: true },
                        apply: { hide: true }
                    }
                ]
            };

            const result = applyRules(contextWidget, mockContext, [branchWidget, contextWidget]);
            expect(result.hide).toBe(true);
        });

        test('cross-widget with NOT flag', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockImplementation(
                (widgetType: string) => {
                    if (widgetType === 'git-branch')
                        return 'develop';
                    if (widgetType === 'context-percentage')
                        return 80;
                    return null;
                }
            );

            const branchWidget: WidgetItem = {
                id: 'branch-1',
                type: 'git-branch'
            };

            const item: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', equals: 'main', not: true },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [branchWidget, item]);
            // Branch is "develop" not "main", NOT inverts: matches
            expect(result.color).toBe('yellow');
        });

        test('uses first widget of matching type when duplicates exist', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockImplementation(
                (_widgetType: string, _ctx: RenderContext, widgetItem: WidgetItem) => {
                    if (widgetItem.id === 'branch-1')
                        return 'main';
                    if (widgetItem.id === 'branch-2')
                        return 'develop';
                    return 80;
                }
            );

            const branch1: WidgetItem = { id: 'branch-1', type: 'git-branch' };
            const branch2: WidgetItem = { id: 'branch-2', type: 'git-branch' };

            const contextWidget: WidgetItem = {
                id: 'ctx-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', equals: 'main' },
                        apply: { color: 'cyan' }
                    }
                ]
            };

            const result = applyRules(
                contextWidget,
                mockContext,
                [branch1, branch2, contextWidget]
            );
            // Should use branch-1 (first match), which returns 'main'
            expect(result.color).toBe('cyan');
        });
    });

    // --- Edge cases and error handling ---

    describe('Edge Cases', () => {
        test('handles widgets without values (no numeric value for numeric operator)', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'custom-text',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('white');
        });

        test('condition with no recognized operator does not match', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { unknownOp: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('white');
        });

        test('condition with null condition value does not match (non-existence op)', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(42);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { equals: null as unknown },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('condition with null widget value and non-existence operator does not match', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(null);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('type mismatch: string operator on number does not crash', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(42);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { startsWith: 'abc' },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('type mismatch: numeric operator on boolean does not crash', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue(true);

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 5 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('type mismatch: numeric operator on string does not crash', () => {
            vi.spyOn(widgetValuesModule, 'getWidgetValue').mockReturnValue('hello');

            const item: WidgetItem = {
                id: 'test',
                type: 'test-widget',
                color: 'white',
                rules: [
                    {
                        when: { lessThan: 10 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('hide property can be applied by rules', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { hide: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.hide).toBe(true);
        });

        test('customText property can be applied by rules', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { customText: 'HIGH' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.customText).toBe('HIGH');
        });

        test('rawValue property can be toggled by rules', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { rawValue: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.rawValue).toBe(true);
        });
    });

    // --- Property merging ---

    describe('Property Merging', () => {
        test('only overrides properties present in apply', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                bold: true,
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('red');
            expect(result.bold).toBe(true); // Not touched by the rule
        });

        test('preserves all non-overridden properties', () => {
            const item: WidgetItem = {
                id: 'test-id',
                type: 'context-percentage',
                color: 'white',
                customText: 'original',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.id).toBe('test-id');
            expect(result.type).toBe('context-percentage');
            expect(result.customText).toBe('original');
            expect(result.color).toBe('red');
        });

        test('merging does not mutate the original item', () => {
            const originalColor = 'white';
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: originalColor,
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { color: 'red', bold: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('red');
            expect(item.color).toBe(originalColor);
            expect(item.bold).toBeUndefined();
        });

        test('backgroundColor can be applied', () => {
            const item: WidgetItem = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { greaterThan: 50 },
                        apply: { backgroundColor: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.backgroundColor).toBe('red');
        });
    });
});
