import {
    describe,
    expect,
    test
} from 'vitest';

import { WidgetItemSchema } from '../Widget';

describe('WidgetItemSchema', () => {
    test('accepts widget without rules', () => {
        const widget = {
            id: 'test-1',
            type: 'model',
            color: 'cyan'
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
    });

    test('accepts widget with rules array', () => {
        const widget = {
            id: 'test-2',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 75 },
                    apply: { color: 'red', bold: true },
                    stop: true
                },
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'yellow' },
                    stop: true
                }
            ]
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules).toBeDefined();
            expect(result.data.rules?.length).toBe(2);
            expect(result.data.rules?.[0]?.when.greaterThan).toBe(75);
            expect(result.data.rules?.[0]?.apply.color).toBe('red');
            expect(result.data.rules?.[0]?.apply.bold).toBe(true);
            expect(result.data.rules?.[0]?.stop).toBe(true);
        }
    });

    test('accepts widget with empty rules array', () => {
        const widget = {
            id: 'test-3',
            type: 'model',
            color: 'cyan',
            rules: []
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules).toBeDefined();
            expect(result.data.rules?.length).toBe(0);
        }
    });

    test('accepts rule without stop property', () => {
        const widget = {
            id: 'test-4',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 50 },
                    apply: { color: 'yellow' }
                }
            ]
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules?.[0]?.stop).toBeUndefined();
        }
    });

    test('accepts rule with numeric comparison for number-valued widgets', () => {
        const widget = {
            id: 'test-5',
            type: 'context-percentage',
            color: 'white',
            rules: [
                {
                    when: { greaterThan: 75, lessThanOrEqual: 100 },
                    apply: { color: 'red', bold: true }
                }
            ]
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules?.[0]?.when.greaterThan).toBe(75);
            expect(result.data.rules?.[0]?.when.lessThanOrEqual).toBe(100);
        }
    });

    test('accepts rule with string comparison for string-valued widgets', () => {
        const widget = {
            id: 'test-6',
            type: 'git-branch',
            color: 'cyan',
            rules: [
                {
                    when: { equals: 'main' },
                    apply: { color: 'green', bold: true }
                },
                {
                    when: { contains: 'feature/' },
                    apply: { color: 'blue' }
                }
            ]
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules?.[0]?.when.equals).toBe('main');
            expect(result.data.rules?.[1]?.when.contains).toBe('feature/');
        }
    });

    test('accepts rule with boolean comparison for boolean-valued widgets', () => {
        const widget = {
            id: 'test-7',
            type: 'git-changes',
            color: 'yellow',
            rules: [
                {
                    when: { equals: true },
                    apply: { color: 'red', bold: true }
                }
            ]
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules?.[0]?.when.equals).toBe(true);
        }
    });

    test('accepts rule with negation flag', () => {
        const widget = {
            id: 'test-8',
            type: 'git-branch',
            color: 'cyan',
            rules: [
                {
                    when: { equals: 'main', not: true },
                    apply: { color: 'yellow' }
                }
            ]
        };

        const result = WidgetItemSchema.safeParse(widget);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules?.[0]?.when.equals).toBe('main');
            expect(result.data.rules?.[0]?.when.not).toBe(true);
        }
    });
});