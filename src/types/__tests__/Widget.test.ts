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
});