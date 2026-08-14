import {
    useCallback,
    useEffect,
    useRef,
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
    /**
     * Reports every state change so an owner above the editor can hold the accordion
     * across a swap between the widget and colour editing modes, which unmount each other.
     */
    onChange?: (state: AccordionState) => void;
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
    initialSelectedRuleIndex = 0,
    onChange
}: UseRuleAccordionOptions): UseRuleAccordionReturn {
    const [state, setState] = useState<AccordionState>({
        expandedWidgetId: initialExpandedWidgetId,
        selectedRuleIndex: initialSelectedRuleIndex
    });

    // Keep the reporting callback in a ref so a caller passing an inline function does not
    // rebuild every transition, which would defeat their useCallback identities.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const applyTransition = useCallback((transition: (prev: AccordionState) => AccordionState) => {
        setState((prev) => {
            const next = transition(prev);
            if (next.expandedWidgetId !== prev.expandedWidgetId
                || next.selectedRuleIndex !== prev.selectedRuleIndex) {
                onChangeRef.current?.(next);
            }
            return next;
        });
    }, []);

    // Reconcile state when the widgets array changes externally
    useEffect(() => {
        applyTransition(prev => reconcile(prev, widgets));
    }, [widgets, applyTransition]);

    const expandCb = useCallback((widgetId: string) => {
        applyTransition(() => expand(widgetId));
    }, [applyTransition]);

    const collapseCb = useCallback(() => {
        applyTransition(() => collapse());
    }, [applyTransition]);

    const toggleExpandCb = useCallback((widgetId: string) => {
        applyTransition(prev => toggleExpand(prev, widgetId));
    }, [applyTransition]);

    const selectRuleCb = useCallback((index: number) => {
        applyTransition(prev => selectRule(prev, index));
    }, [applyTransition]);

    const selectPrevRuleCb = useCallback(() => {
        applyTransition(prev => selectPrevRule(prev, widgets));
    }, [widgets, applyTransition]);

    const selectNextRuleCb = useCallback(() => {
        applyTransition(prev => selectNextRule(prev, widgets));
    }, [widgets, applyTransition]);

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
