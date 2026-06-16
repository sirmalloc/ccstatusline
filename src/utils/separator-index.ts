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
    let previousRenderableWidget: WidgetItem | null = null;

    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget) {
            continue;
        }

        if (widget.type === 'separator') {
            continue;
        }

        if (widget.type === 'flex-separator') {
            previousRenderableWidget = null;
            continue;
        }

        if (!hasRenderedContent(i, preRenderedWidgets)) {
            continue;
        }

        if (previousRenderableWidget && !previousRenderableWidget.merge) {
            count++;
        }
        previousRenderableWidget = widget;
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
