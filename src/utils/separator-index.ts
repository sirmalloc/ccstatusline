import type { WidgetItem } from '../types/Widget';

export interface SeparatorSlotEntry {
    content: string;
    widget: WidgetItem;
}

function hasRenderedContent(
    widgetIndex: number,
    preRenderedWidgets?: SeparatorSlotEntry[]
): boolean {
    return preRenderedWidgets ? Boolean(preRenderedWidgets[widgetIndex]?.content) : true;
}

interface SeparatorSlotState {
    count: number;
    hasPreviousRenderableWidget: boolean;
    previousRenderableWidgetMergesWithNext: boolean;
}

// How one widget moves the count along
function advanceSeparatorSlots(state: SeparatorSlotState, widget: WidgetItem, rendered: boolean): SeparatorSlotState {
    if (widget.type === 'separator') {
        return state.hasPreviousRenderableWidget ? { ...state, previousRenderableWidgetMergesWithNext: false } : state;
    }

    if (widget.type === 'flex-separator') {
        return { ...state, hasPreviousRenderableWidget: false, previousRenderableWidgetMergesWithNext: false };
    }

    if (!rendered) {
        // A merge carries past a widget that renders nothing only if that
        // widget is merged onward too; otherwise the merge ends with it.
        return widget.merge ? state : { ...state, previousRenderableWidgetMergesWithNext: false };
    }

    return {
        count: state.hasPreviousRenderableWidget && !state.previousRenderableWidgetMergesWithNext ? state.count + 1 : state.count,
        hasPreviousRenderableWidget: true,
        previousRenderableWidgetMergesWithNext: Boolean(widget.merge)
    };
}

export function countSeparatorSlots(
    widgets: WidgetItem[],
    preRenderedWidgets?: SeparatorSlotEntry[]
): number {
    let state: SeparatorSlotState = { count: 0, hasPreviousRenderableWidget: false, previousRenderableWidgetMergesWithNext: false };

    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (widget) {
            state = advanceSeparatorSlots(state, widget, hasRenderedContent(i, preRenderedWidgets));
        }
    }

    return state.count;
}

export function advanceGlobalSeparatorIndex(
    currentIndex: number,
    widgets: WidgetItem[],
    preRenderedWidgets?: SeparatorSlotEntry[]
): number {
    return currentIndex + countSeparatorSlots(widgets, preRenderedWidgets);
}
