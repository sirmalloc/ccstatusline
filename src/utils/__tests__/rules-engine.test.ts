import { execSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    test,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { clearGitCache } from '../git';
import { applyRules } from '../rules-engine';

// Mock child_process
vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
    mockImplementation: (impl: () => never) => void;
};

describe('Rules Engine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
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

    test('returns original item when no rules', () => {
        const item = {
            id: 'test',
            type: 'context-percentage',
            color: 'white'
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result).toEqual(item);
    });

    test('applies color override when condition matches', () => {
        const item = {
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
        const item = {
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

    test('evaluates rules top-to-bottom', () => {
        const item = {
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
        // Both match (80 > 50 and 80 > 70), but second overrides first (no stop flags)
        expect(result.color).toBe('red');
    });

    test('respects stop flag', () => {
        const item = {
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
        // First rule matches and stops, second never evaluated
        expect(result.color).toBe('yellow');
    });

    test('applies multiple properties from one rule', () => {
        const item = {
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

    test('handles widgets without numeric values', () => {
        const item = {
            id: 'test',
            type: 'custom-text',  // No numeric value
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'red' }
                }
            ]
        };

        const result = applyRules(item, mockContext, [item]);
        // No numeric value, condition can't match
        expect(result.color).toBe('white');
    });

    test('all numeric operators work', () => {
        const testCases = [
            { operator: 'greaterThan', value: 70, expected: true },
            { operator: 'greaterThan', value: 90, expected: false },
            { operator: 'greaterThanOrEqual', value: 80, expected: true },
            { operator: 'greaterThanOrEqual', value: 81, expected: false },
            { operator: 'lessThan', value: 90, expected: true },
            { operator: 'lessThan', value: 70, expected: false },
            { operator: 'lessThanOrEqual', value: 80, expected: true },
            { operator: 'lessThanOrEqual', value: 79, expected: false },
            { operator: 'equals', value: 80, expected: true },
            { operator: 'equals', value: 79, expected: false }
        ];

        for (const { operator, value, expected } of testCases) {
            const item = {
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

    test('handles empty rules array', () => {
        const item = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            rules: []
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result).toEqual(item);
    });

    test('accumulates properties from multiple matching rules without stop', () => {
        const item = {
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
        // All three match (80 > 50, 80 > 60, 80 > 70)
        // Color: white → yellow → red (last override wins)
        // Bold: false → true (only set once)
        expect(result.color).toBe('red');
        expect(result.bold).toBe(true);
    });

    // Cross-widget condition tests
    test('cross-widget condition: references other widget value', () => {
        // Mock git commands to return changes (git-changes is a boolean widget)
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('1 file changed, 10 insertions(+)');
        mockExecSync.mockReturnValueOnce('');

        const gitChangesWidget = {
            id: 'git-1',
            type: 'git-changes',
            color: 'white'
        };

        const contextWidget = {
            id: 'context-1',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { widget: 'git-changes', isTrue: true },
                    apply: { color: 'red' }
                }
            ]
        };

        const result = applyRules(contextWidget, mockContext, [gitChangesWidget, contextWidget]);
        expect(result.color).toBe('red');
    });

    test('cross-widget condition: does not match when boolean is false', () => {
        // Mock git commands to return no changes (git-changes returns false)
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');
        mockExecSync.mockReturnValueOnce('');

        const gitChangesWidget = {
            id: 'git-1',
            type: 'git-changes',
            color: 'white'
        };

        const contextWidget = {
            id: 'context-1',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { widget: 'git-changes', isTrue: true },
                    apply: { color: 'red' }
                }
            ]
        };

        const result = applyRules(contextWidget, mockContext, [gitChangesWidget, contextWidget]);
        expect(result.color).toBe('white');
    });

    test('cross-widget condition: fails gracefully when widget not found', () => {
        const contextWidget = {
            id: 'context-1',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { widget: 'git-changes', greaterThan: 5 },
                    apply: { color: 'red' }
                }
            ]
        };

        // No git-changes widget in line, and no git data
        // git-changes widget should return null for numeric value
        const result = applyRules(contextWidget, mockContext, [contextWidget]);
        expect(result.color).toBe('white');  // Rule doesn't match (no numeric value)
    });

    test('cross-widget condition: self reference works explicitly', () => {
        const item = {
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

    test('cross-widget condition: implicit self reference (no widget property)', () => {
        const item = {
            id: 'test',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 50 },  // No widget property
                    apply: { color: 'yellow' }
                }
            ]
        };

        const result = applyRules(item, mockContext, [item]);
        expect(result.color).toBe('yellow');
    });

    test('cross-widget condition: evaluates widget not in line', () => {
        // Test that rules can reference ANY widget from catalog, not just widgets in the line
        const item = {
            id: 'test',
            type: 'git-branch',
            color: 'white',
            rules: [
                {
                    // Reference tokens-input widget which is NOT in the line
                    when: { widget: 'tokens-input', greaterThan: 100000 },
                    apply: { color: 'yellow' }
                }
            ]
        };

        // Note: tokens-input widget is NOT in allWidgetsInLine
        // Rules engine should create temporary instance and evaluate it
        // mockContext has total_input_tokens: 150000 which is > 100000
        const result = applyRules(item, mockContext, [item]);
        expect(result.color).toBe('yellow');
    });

    test('cross-widget condition: widget not in line returns false when no value', () => {
        // Mock git command returning false (not in a git repo)
        mockExecSync.mockReturnValueOnce('false\n');

        const item = {
            id: 'test',
            type: 'git-branch',
            color: 'white',
            rules: [
                {
                    // Reference git-changes which is not in line AND has no value in context
                    when: { widget: 'git-changes', greaterThan: 5 },
                    apply: { color: 'red' }
                }
            ]
        };

        // Context without git data - widget will render "(no git)" which parses to null
        const result = applyRules(item, mockContext, [item]);
        // Rule should not match (git-changes has no numeric value)
        expect(result.color).toBe('white');
    });

    // String operator tests
    describe('String Operators', () => {
        test('contains operator matches substring', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('feature/advanced-operators\n');

            const item = {
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
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('main\n');

            const item = {
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
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('feature/test\n');

            const item = {
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
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('bugfix/test\n');

            const item = {
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

            const item = {
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

            const item = {
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
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('main\n');

            const item = {
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
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('develop\n');

            const item = {
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

        test('equals with not flag acts as notEquals for strings', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('develop\n');

            const item = {
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

        test('equals still works for numeric values', () => {
            const item = {
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

        test('isEmpty matches empty string widget', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: '',
                color: 'white',
                rules: [
                    {
                        when: { isEmpty: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('gray');
        });

        test('isEmpty does not match non-empty string', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: 'hello',
                color: 'white',
                rules: [
                    {
                        when: { isEmpty: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('isEmpty matches null widget value', () => {
            // custom-text with no customText set renders '' which getWidgetValue returns as null
            const item = {
                id: 'test',
                type: 'custom-text',
                color: 'white',
                rules: [
                    {
                        when: { isEmpty: true },
                        apply: { color: 'gray' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('gray');
        });

        test('isEmpty with not flag acts as notEmpty', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: 'hello',
                color: 'white',
                rules: [
                    {
                        when: { isEmpty: true, not: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('notEmpty does not match empty string', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: '',
                color: 'white',
                rules: [
                    {
                        when: { isEmpty: true, not: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('string operators fail on numeric widgets', () => {
            const item = {
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
            // Type mismatch - context-percentage returns number, not string
            expect(result.color).toBe('white');
        });
    });

    // Boolean operator tests
    describe('Boolean Operators', () => {
        test('isTrue operator matches boolean widget with true value', () => {
            // Mock git commands to return changes
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('1 file changed, 10 insertions(+)');
            mockExecSync.mockReturnValueOnce('');

            const item = {
                id: 'test',
                type: 'git-changes',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // git-changes is a boolean widget, returns true when changes exist
            expect(result.color).toBe('red');
        });

        test('isTrue operator works with custom-text returning "true"', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: 'true',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('isTrue operator does not match "false" string', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: 'false',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
        });

        test('isTrue with false condition value matches false boolean', () => {
            const item = {
                id: 'test',
                type: 'custom-text',
                customText: 'false',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: false },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('green');
        });

        test('isFalse on boolean widget with no changes', () => {
            // Mock git commands to return no changes
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');

            const item = {
                id: 'test',
                type: 'git-changes',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: false },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // git-changes returns false (no changes), isTrue: false matches
            expect(result.color).toBe('green');
        });

        test('git-staged boolean widget with isTrue', () => {
            // Mock git commands - git-staged checks for staged files
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('A  file.txt\n');

            const item = {
                id: 'test',
                type: 'git-staged',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // git-staged is a boolean widget, returns true when staged files exist
            expect(result.color).toBe('yellow');
        });

        test('isTrue with numeric coercion: non-zero number is true', () => {
            const item = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // context-percentage returns 80 (number), coerced to true (non-zero)
            expect(result.color).toBe('green');
        });

        test('isTrue with numeric coercion: zero is false', () => {
            const zeroContext: RenderContext = {
                data: {
                    context_window: {
                        context_window_size: 200000,
                        total_input_tokens: 0,
                        total_output_tokens: 0,
                        current_usage: null,
                        used_percentage: 0,
                        remaining_percentage: 100
                    }
                }
            };

            const item = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, zeroContext, [item]);
            // context-percentage returns 0 (number), coerced to false, isTrue: true does not match
            expect(result.color).toBe('white');
        });
    });

    // Set operator tests
    describe('Set Operators', () => {
        test('in operator matches when value in array', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('main\n');

            const item = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { in: ['main', 'master', 'develop'] },
                        apply: { color: 'cyan', bold: true }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('cyan');
            expect(result.bold).toBe(true);
        });

        test('in operator does not match when value not in array', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('feature/test\n');

            const item = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        when: { in: ['main', 'master', 'develop'] },
                        apply: { color: 'cyan', bold: true }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.color).toBe('white');
            expect(result.bold).toBeUndefined();
        });

        test('notIn operator matches when value not in array', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const item = {
                id: 'test',
                type: 'model',
                color: 'white',
                rules: [
                    {
                        when: { notIn: ['claude-haiku-4-5-20251001'] },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, context, [item]);
            expect(result.bold).toBe(true);
        });

        test('notIn operator does not match when value in array', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const item = {
                id: 'test',
                type: 'model',
                color: 'white',
                rules: [
                    {
                        when: { notIn: ['claude-opus-4-6', 'claude-sonnet-4-6'] },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, context, [item]);
            expect(result.bold).toBeUndefined();
        });

        test('in operator works with numeric values', () => {
            const item = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { in: [60, 70, 80, 90] },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('yellow');
        });
    });

    // Cross-widget with advanced operators
    describe('Cross-Widget Advanced Operators', () => {
        test('cross-widget string condition', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('urgent/fix-bug\n');

            const item = {
                id: 'context-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', contains: 'urgent' },
                        apply: { color: 'red', bold: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('red');
            expect(result.bold).toBe(true);
        });

        test('cross-widget boolean condition with typed value', () => {
            // Mock git commands to return changes (git-changes is boolean)
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('2 files changed, 5 insertions(+)');
            mockExecSync.mockReturnValueOnce('');

            const item = {
                id: 'context-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-changes', isTrue: true },
                        apply: { color: 'yellow', bold: true }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // git-changes returns true (boolean), isTrue: true matches
            expect(result.color).toBe('yellow');
            expect(result.bold).toBe(true);
        });

        test('cross-widget numeric condition with typed value', () => {
            const item = {
                id: 'test',
                type: 'git-branch',
                color: 'white',
                rules: [
                    {
                        // Reference context-percentage which returns a number
                        when: { widget: 'context-percentage', greaterThan: 50 },
                        apply: { color: 'red' }
                    }
                ]
            };

            // mockContext has used_percentage: 80 which is > 50
            const result = applyRules(item, mockContext, [item]);
            expect(result.color).toBe('red');
        });

        test('cross-widget set condition', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('main\n');

            const item = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', in: ['main', 'master'] },
                        apply: { character: '🔒' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            expect(result.character).toBe('🔒');
        });
    });

    // NOT flag tests
    describe('NOT Flag (Negation)', () => {
        test('NOT with numeric operator inverts result', () => {
            const item = {
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
            // Value is 80, which is NOT > 90, so condition matches
            expect(result.color).toBe('green');
        });

        test('NOT with numeric operator when false', () => {
            const item = {
                id: 'test',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { lessThan: 50, not: true },
                        apply: { color: 'red' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // Value is 80, which is NOT < 50, so condition matches
            expect(result.color).toBe('red');
        });

        test('NOT with string operator (notContains)', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('main\n');

            const item = {
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
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('bugfix/test\n');

            const item = {
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
            // Branch is "bugfix/test" which does NOT start with "feature/", so condition matches
            expect(result.color).toBe('yellow');
        });

        test('NOT with boolean operator', () => {
            // Mock git commands to return no changes
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');

            const item = {
                id: 'test',
                type: 'git-changes',
                color: 'white',
                rules: [
                    {
                        when: { isTrue: true, not: true },
                        apply: { color: 'green' }
                    }
                ]
            };

            const result = applyRules(item, {}, [item]);
            // No changes = 0 = false, NOT true = true matches, so condition matches
            expect(result.color).toBe('green');
        });

        test('NOT with set operator (notIn)', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const item = {
                id: 'test',
                type: 'model',
                color: 'white',
                rules: [
                    {
                        when: { in: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'], not: true },
                        apply: { bold: true }
                    }
                ]
            };

            const result = applyRules(item, context, [item]);
            // Model is NOT in the list, so condition matches
            expect(result.bold).toBe(true);
        });

        test('NOT flag with cross-widget condition', () => {
            // Mock git commands for branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('develop\n');

            const item = {
                id: 'context-1',
                type: 'context-percentage',
                color: 'white',
                rules: [
                    {
                        when: { widget: 'git-branch', in: ['main', 'master'], not: true },
                        apply: { color: 'yellow' }
                    }
                ]
            };

            const result = applyRules(item, mockContext, [item]);
            // Branch is "develop" which is NOT in ["main", "master"], so condition matches
            expect(result.color).toBe('yellow');
        });

        test('Multiple rules with mixed NOT flags', () => {
            const item = {
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
            // First rule: 80 is NOT > 90 = matches, applies green
            // Second rule: 80 > 70 = matches, applies bold
            expect(result.color).toBe('green');
            expect(result.bold).toBe(true);
        });
    });
});