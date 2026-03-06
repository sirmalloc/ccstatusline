import type { WidgetItem } from '../types/Widget';

export function countSeparatorSlots(widgets: WidgetItem[]): number {
    const nonMergedWidgets = widgets.filter((_, idx) => idx === widgets.length - 1 || !widgets[idx]?.merge);
    return Math.max(0, nonMergedWidgets.length - 1);
}

export function advanceGlobalSeparatorIndex(currentIndex: number, widgets: WidgetItem[]): number {
    return currentIndex + countSeparatorSlots(widgets);
}