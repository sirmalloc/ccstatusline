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

export function countSeparatorSlots(
    widgets: WidgetItem[],
    preRenderedWidgets?: SeparatorSlotEntry[]
): number {
    let count = 0;
    let hasPreviousRenderableWidget = false;
    let previousRenderableWidgetMergesWithNext = false;

    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget) {
            continue;
        }

        if (widget.type === 'separator') {
            if (hasPreviousRenderableWidget) {
                previousRenderableWidgetMergesWithNext = false;
            }
            continue;
        }

        if (widget.type === 'flex-separator') {
            hasPreviousRenderableWidget = false;
            previousRenderableWidgetMergesWithNext = false;
            continue;
        }

        if (!hasRenderedContent(i, preRenderedWidgets)) {
            continue;
        }

        if (hasPreviousRenderableWidget && !previousRenderableWidgetMergesWithNext) {
            count++;
        }
        hasPreviousRenderableWidget = true;
        previousRenderableWidgetMergesWithNext = Boolean(widget.merge);
    }

    return count;
}

export function advanceGlobalSeparatorIndex(
    currentIndex: number,
    widgets: WidgetItem[],
    preRenderedWidgets?: SeparatorSlotEntry[]
): number {
    return currentIndex + countSeparatorSlots(widgets, preRenderedWidgets);
}
