import type { WidgetItem } from '../types/Widget';

export interface PowerlineThemeSlotEntry {
    content: string;
    widget: WidgetItem;
}

export function countPowerlineThemeSlots(entries: PowerlineThemeSlotEntry[]): number {
    let previousVisibleWidget: WidgetItem | null = null;
    let slotCount = 0;

    for (const entry of entries) {
        if (!entry.content || entry.widget.type === 'separator' || entry.widget.type === 'flex-separator') {
            continue;
        }

        if (!previousVisibleWidget?.merge) {
            slotCount++;
        }

        previousVisibleWidget = entry.widget;
    }

    return slotCount;
}

export function advanceGlobalPowerlineThemeIndex(currentIndex: number, entries: PowerlineThemeSlotEntry[]): number {
    return currentIndex + countPowerlineThemeSlots(entries);
}