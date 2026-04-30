import {
    useCallback,
    useEffect,
    useState
} from 'react';

import type { WidgetItem } from '../../types/Widget';

// --- Accordion state shape ---

export interface AccordionState {
    expandedWidgetId: string | null;
    selectedRuleIndex: number;
}

// --- Pure state-transition functions (exported for testing) ---

/** Returns the number of rules on a widget (0 if undefined). */
export function getRuleCount(widget: WidgetItem): number {
    return widget.rules?.length ?? 0;
}

/** Expand a widget's rules accordion, resetting the rule selection. */
export function expand(widgetId: string): AccordionState {
    return { expandedWidgetId: widgetId, selectedRuleIndex: 0 };
}

/** Collapse the accordion. */
export function collapse(): AccordionState {
    return { expandedWidgetId: null, selectedRuleIndex: 0 };
}

/** Toggle: expand if collapsed or different widget, collapse if same. */
export function toggleExpand(state: AccordionState, widgetId: string): AccordionState {
    if (state.expandedWidgetId === widgetId) {
        return collapse();
    }
    return expand(widgetId);
}

/** Set the selected rule index directly. */
export function selectRule(state: AccordionState, index: number): AccordionState {
    return { ...state, selectedRuleIndex: index };
}

/** Move selection up with wrap-around. No-op if nothing is expanded or no rules exist. */
export function selectPrevRule(
    state: AccordionState,
    widgets: WidgetItem[]
): AccordionState {
    if (state.expandedWidgetId === null) {
        return state;
    }

    const widget = widgets.find(w => w.id === state.expandedWidgetId);
    if (!widget) {
        return state;
    }

    const count = getRuleCount(widget);
    if (count === 0) {
        return state;
    }

    const next = state.selectedRuleIndex - 1;
    return { ...state, selectedRuleIndex: next < 0 ? count - 1 : next };
}

/** Move selection down with wrap-around. No-op if nothing is expanded or no rules exist. */
export function selectNextRule(
    state: AccordionState,
    widgets: WidgetItem[]
): AccordionState {
    if (state.expandedWidgetId === null) {
        return state;
    }

    const widget = widgets.find(w => w.id === state.expandedWidgetId);
    if (!widget) {
        return state;
    }

    const count = getRuleCount(widget);
    if (count === 0) {
        return state;
    }

    const next = state.selectedRuleIndex + 1;
    return { ...state, selectedRuleIndex: next >= count ? 0 : next };
}

/** Check whether a specific widget is the one currently expanded. */
export function isExpanded(state: AccordionState, widgetId: string): boolean {
    return state.expandedWidgetId === widgetId;
}

/**
 * Reconcile accordion state after external changes to the widgets array.
 * Auto-collapses when the expanded widget is deleted and clamps the
 * selected-rule index when rules are removed.
 */
export function reconcile(
    state: AccordionState,
    widgets: WidgetItem[]
): AccordionState {
    if (state.expandedWidgetId === null) {
        return state;
    }

    const widget = widgets.find(w => w.id === state.expandedWidgetId);

    // Expanded widget was deleted -- collapse
    if (!widget) {
        return collapse();
    }

    const count = getRuleCount(widget);

    // No rules -- keep expanded but reset index
    if (count === 0) {
        if (state.selectedRuleIndex !== 0) {
            return { ...state, selectedRuleIndex: 0 };
        }
        return state;
    }

    // Clamp index if it exceeds the available rules
    if (state.selectedRuleIndex >= count) {
        return { ...state, selectedRuleIndex: count - 1 };
    }

    return state;
}

// --- Hook interface ---

export interface UseRuleAccordionOptions {
    widgets: WidgetItem[];
    initialExpandedWidgetId?: string | null;
    initialSelectedRuleIndex?: number;
}

export interface UseRuleAccordionReturn {
    expandedWidgetId: string | null;
    selectedRuleIndex: number;
    expand: (widgetId: string) => void;
    collapse: () => void;
    toggleExpand: (widgetId: string) => void;
    selectRule: (index: number) => void;
    selectPrevRule: () => void;
    selectNextRule: () => void;
    isExpanded: (widgetId: string) => boolean;
    getRuleCount: (widget: WidgetItem) => number;
}

// --- React hook ---

export function useRuleAccordion({
    widgets,
    initialExpandedWidgetId = null,
    initialSelectedRuleIndex = 0
}: UseRuleAccordionOptions): UseRuleAccordionReturn {
    const [state, setState] = useState<AccordionState>({
        expandedWidgetId: initialExpandedWidgetId,
        selectedRuleIndex: initialSelectedRuleIndex
    });

    // Reconcile state when the widgets array changes externally
    useEffect(() => {
        setState(prev => reconcile(prev, widgets));
    }, [widgets]);

    const expandCb = useCallback((widgetId: string) => {
        setState(expand(widgetId));
    }, []);

    const collapseCb = useCallback(() => {
        setState(collapse());
    }, []);

    const toggleExpandCb = useCallback((widgetId: string) => {
        setState(prev => toggleExpand(prev, widgetId));
    }, []);

    const selectRuleCb = useCallback((index: number) => {
        setState(prev => selectRule(prev, index));
    }, []);

    const selectPrevRuleCb = useCallback(() => {
        setState(prev => selectPrevRule(prev, widgets));
    }, [widgets]);

    const selectNextRuleCb = useCallback(() => {
        setState(prev => selectNextRule(prev, widgets));
    }, [widgets]);

    const isExpandedCb = useCallback((widgetId: string) => {
        return isExpanded(state, widgetId);
    }, [state]);

    const getRuleCountCb = useCallback((widget: WidgetItem) => {
        return getRuleCount(widget);
    }, []);

    return {
        expandedWidgetId: state.expandedWidgetId,
        selectedRuleIndex: state.selectedRuleIndex,
        expand: expandCb,
        collapse: collapseCb,
        toggleExpand: toggleExpandCb,
        selectRule: selectRuleCb,
        selectPrevRule: selectPrevRuleCb,
        selectNextRule: selectNextRuleCb,
        isExpanded: isExpandedCb,
        getRuleCount: getRuleCountCb
    };
}
