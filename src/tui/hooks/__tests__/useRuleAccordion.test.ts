import {
    describe,
    expect,
    test
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    collapse,
    expand,
    getRuleCount,
    isExpanded,
    reconcile,
    selectNextRule,
    selectPrevRule,
    selectRule,
    toggleExpand,
    type AccordionState
} from '../useRuleAccordion';

// --- Test helpers ---

function widget(id: string, ruleCount = 0): WidgetItem {
    return {
        id,
        type: 'model',
        rules: ruleCount > 0
            ? Array.from({ length: ruleCount }, () => ({
                when: { widget: 'self', equals: 'test' },
                apply: { color: 'red' }
            }))
            : undefined
    };
}

function widgetWithEmptyRules(id: string): WidgetItem {
    return { id, type: 'model', rules: [] };
}

const COLLAPSED: AccordionState = { expandedWidgetId: null, selectedRuleIndex: 0 };

function expanded(widgetId: string, selectedRuleIndex = 0): AccordionState {
    return { expandedWidgetId: widgetId, selectedRuleIndex };
}

// --- getRuleCount ---

describe('getRuleCount', () => {
    test('returns 0 when rules is undefined', () => {
        expect(getRuleCount(widget('a'))).toBe(0);
    });

    test('returns 0 when rules is an empty array', () => {
        expect(getRuleCount(widgetWithEmptyRules('a'))).toBe(0);
    });

    test('returns the number of rules', () => {
        expect(getRuleCount(widget('a', 3))).toBe(3);
    });
});

// --- expand ---

describe('expand', () => {
    test('sets expandedWidgetId and resets selectedRuleIndex to 0', () => {
        expect(expand('w1')).toEqual({ expandedWidgetId: 'w1', selectedRuleIndex: 0 });
    });
});

// --- collapse ---

describe('collapse', () => {
    test('sets expandedWidgetId to null', () => {
        const result = collapse();
        expect(result.expandedWidgetId).toBeNull();
        expect(result.selectedRuleIndex).toBe(0);
    });
});

// --- toggleExpand ---

describe('toggleExpand', () => {
    test('expands when currently collapsed', () => {
        expect(toggleExpand(COLLAPSED, 'w1')).toEqual(expanded('w1'));
    });

    test('collapses when toggling the same widget', () => {
        expect(toggleExpand(expanded('w1'), 'w1')).toEqual(COLLAPSED);
    });

    test('switches to a different widget when one is already expanded', () => {
        const result = toggleExpand(expanded('w1', 2), 'w2');
        expect(result).toEqual(expanded('w2', 0));
    });
});

// --- selectRule ---

describe('selectRule', () => {
    test('sets the selected rule index', () => {
        expect(selectRule(expanded('w1'), 3)).toEqual(expanded('w1', 3));
    });

    test('preserves expanded widget', () => {
        const result = selectRule(expanded('w1'), 5);
        expect(result.expandedWidgetId).toBe('w1');
        expect(result.selectedRuleIndex).toBe(5);
    });
});

// --- selectPrevRule ---

describe('selectPrevRule', () => {
    const widgets = [widget('w1', 3), widget('w2', 2)];

    test('moves selection up', () => {
        const result = selectPrevRule(expanded('w1', 2), widgets);
        expect(result.selectedRuleIndex).toBe(1);
    });

    test('wraps to last rule when at index 0', () => {
        const result = selectPrevRule(expanded('w1', 0), widgets);
        expect(result.selectedRuleIndex).toBe(2); // 3 rules, wraps to index 2
    });

    test('is a no-op when collapsed', () => {
        const result = selectPrevRule(COLLAPSED, widgets);
        expect(result).toBe(COLLAPSED);
    });

    test('is a no-op when expanded widget has no rules', () => {
        const noRulesWidgets = [widget('w1', 0)];
        const state = expanded('w1');
        const result = selectPrevRule(state, noRulesWidgets);
        expect(result).toBe(state);
    });

    test('is a no-op when expanded widget does not exist', () => {
        const state = expanded('missing');
        const result = selectPrevRule(state, widgets);
        expect(result).toBe(state);
    });

    test('works with single rule (wraps to itself)', () => {
        const singleRule = [widget('w1', 1)];
        const result = selectPrevRule(expanded('w1', 0), singleRule);
        expect(result.selectedRuleIndex).toBe(0);
    });
});

// --- selectNextRule ---

describe('selectNextRule', () => {
    const widgets = [widget('w1', 3), widget('w2', 2)];

    test('moves selection down', () => {
        const result = selectNextRule(expanded('w1', 0), widgets);
        expect(result.selectedRuleIndex).toBe(1);
    });

    test('wraps to first rule when at last index', () => {
        const result = selectNextRule(expanded('w1', 2), widgets);
        expect(result.selectedRuleIndex).toBe(0); // 3 rules, wraps from index 2 to 0
    });

    test('is a no-op when collapsed', () => {
        const result = selectNextRule(COLLAPSED, widgets);
        expect(result).toBe(COLLAPSED);
    });

    test('is a no-op when expanded widget has no rules', () => {
        const noRulesWidgets = [widget('w1', 0)];
        const state = expanded('w1');
        const result = selectNextRule(state, noRulesWidgets);
        expect(result).toBe(state);
    });

    test('is a no-op when expanded widget does not exist', () => {
        const state = expanded('missing');
        const result = selectNextRule(state, widgets);
        expect(result).toBe(state);
    });

    test('works with single rule (wraps to itself)', () => {
        const singleRule = [widget('w1', 1)];
        const result = selectNextRule(expanded('w1', 0), singleRule);
        expect(result.selectedRuleIndex).toBe(0);
    });
});

// --- isExpanded ---

describe('isExpanded', () => {
    test('returns true when the widget is expanded', () => {
        expect(isExpanded(expanded('w1'), 'w1')).toBe(true);
    });

    test('returns false for a different widget', () => {
        expect(isExpanded(expanded('w1'), 'w2')).toBe(false);
    });

    test('returns false when collapsed', () => {
        expect(isExpanded(COLLAPSED, 'w1')).toBe(false);
    });
});

// --- reconcile ---

describe('reconcile', () => {
    test('returns state unchanged when collapsed', () => {
        const widgets = [widget('w1', 2)];
        const result = reconcile(COLLAPSED, widgets);
        expect(result).toBe(COLLAPSED);
    });

    test('collapses when the expanded widget is deleted', () => {
        const state = expanded('deleted', 1);
        const widgets = [widget('w1', 2)];
        const result = reconcile(state, widgets);
        expect(result.expandedWidgetId).toBeNull();
        expect(result.selectedRuleIndex).toBe(0);
    });

    test('clamps selectedRuleIndex when rules are removed', () => {
        // Widget had 5 rules, user was on rule 4 (index), now widget has 2 rules
        const state = expanded('w1', 4);
        const widgets = [widget('w1', 2)];
        const result = reconcile(state, widgets);
        expect(result.expandedWidgetId).toBe('w1');
        expect(result.selectedRuleIndex).toBe(1); // clamped to last rule (index 1)
    });

    test('resets index to 0 when all rules are removed', () => {
        const state = expanded('w1', 2);
        const widgets = [widget('w1', 0)];
        const result = reconcile(state, widgets);
        expect(result.expandedWidgetId).toBe('w1'); // stays expanded (shows empty state)
        expect(result.selectedRuleIndex).toBe(0);
    });

    test('returns state unchanged when selectedRuleIndex is still valid', () => {
        const state = expanded('w1', 1);
        const widgets = [widget('w1', 3)];
        const result = reconcile(state, widgets);
        expect(result).toBe(state);
    });

    test('keeps expanded state for widget with no rules (empty state placeholder)', () => {
        const state = expanded('w1', 0);
        const widgets = [widgetWithEmptyRules('w1')];
        const result = reconcile(state, widgets);
        expect(result).toBe(state);
        expect(result.expandedWidgetId).toBe('w1');
    });

    test('clamps correctly when selectedRuleIndex equals ruleCount', () => {
        // Boundary: exactly at the edge
        const state = expanded('w1', 3);
        const widgets = [widget('w1', 3)];
        const result = reconcile(state, widgets);
        expect(result.selectedRuleIndex).toBe(2); // 3 rules, max index is 2
    });

    test('returns state unchanged when selectedRuleIndex is exactly the last valid index', () => {
        const state = expanded('w1', 2);
        const widgets = [widget('w1', 3)];
        const result = reconcile(state, widgets);
        expect(result).toBe(state);
    });
});

// --- State transition sequences ---

describe('state transition sequences', () => {
    test('expand -> selectNext -> selectNext -> selectPrev', () => {
        const widgets = [widget('w1', 3)];

        let state = expand('w1');
        expect(state.selectedRuleIndex).toBe(0);

        state = selectNextRule(state, widgets);
        expect(state.selectedRuleIndex).toBe(1);

        state = selectNextRule(state, widgets);
        expect(state.selectedRuleIndex).toBe(2);

        state = selectPrevRule(state, widgets);
        expect(state.selectedRuleIndex).toBe(1);
    });

    test('expand -> toggle same -> is collapsed', () => {
        let state = expand('w1');
        expect(state.expandedWidgetId).toBe('w1');

        state = toggleExpand(state, 'w1');
        expect(state.expandedWidgetId).toBeNull();
    });

    test('expand w1 -> navigate rules -> toggle to w2 -> resets index', () => {
        const widgets = [widget('w1', 3), widget('w2', 2)];

        let state = expand('w1');
        state = selectNextRule(state, widgets);
        state = selectNextRule(state, widgets);
        expect(state.selectedRuleIndex).toBe(2);

        state = toggleExpand(state, 'w2');
        expect(state.expandedWidgetId).toBe('w2');
        expect(state.selectedRuleIndex).toBe(0);
    });

    test('expand -> delete widget -> reconcile collapses', () => {
        let state = expand('w1');
        state = selectRule(state, 2);

        // Simulate widget deletion
        const widgets = [widget('w2', 1)];
        state = reconcile(state, widgets);

        expect(state.expandedWidgetId).toBeNull();
        expect(state.selectedRuleIndex).toBe(0);
    });

    test('full wrap-around cycle (next)', () => {
        const widgets = [widget('w1', 3)];
        let state = expand('w1');

        state = selectNextRule(state, widgets); // 0 -> 1
        state = selectNextRule(state, widgets); // 1 -> 2
        state = selectNextRule(state, widgets); // 2 -> 0 (wrap)
        expect(state.selectedRuleIndex).toBe(0);
    });

    test('full wrap-around cycle (prev)', () => {
        const widgets = [widget('w1', 3)];
        let state = expand('w1');

        state = selectPrevRule(state, widgets); // 0 -> 2 (wrap)
        state = selectPrevRule(state, widgets); // 2 -> 1
        state = selectPrevRule(state, widgets); // 1 -> 0
        expect(state.selectedRuleIndex).toBe(0);
    });
});
