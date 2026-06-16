import type { WidgetItem } from '../types/Widget';

export function countSeparatorSlots(widgets: WidgetItem[]): number {
    let count = 0;
    let previousRenderableWidget: WidgetItem | null = null;

    for (const widget of widgets) {
        if (widget.type === 'separator') {
            continue;
        }

        if (widget.type === 'flex-separator') {
            previousRenderableWidget = null;
            continue;
        }

        if (previousRenderableWidget && !previousRenderableWidget.merge) {
            count++;
        }
        previousRenderableWidget = widget;
    }

    return count;
}

export function advanceGlobalSeparatorIndex(currentIndex: number, widgets: WidgetItem[]): number {
    return currentIndex + countSeparatorSlots(widgets);
}
