import type { WidgetItem } from '../types/Widget';

export interface PowerlineThemeSlotEntry {
    content: string;
    widget: WidgetItem;
}

/** Slot assigned to entries that take no theme color (separators, unrendered widgets). */
export const NO_THEME_SLOT = -1;

/**
 * Theme color slot for each entry, in order. Merged widgets share a slot, separators
 * break a merge run, and widgets that render nothing take no slot at all.
 *
 * This is the one place that decides which theme color a widget renders in - the
 * powerline renderer and the color editor both read their answer from here.
 */
export function assignPowerlineThemeSlots(entries: PowerlineThemeSlotEntry[], startIndex = 0): number[] {
    const slots: number[] = [];
    let previousVisibleWidget: WidgetItem | null = null;
    let slotIndex = startIndex;
    let assignedAny = false;

    for (const entry of entries) {
        if (entry.widget.type === 'separator' || entry.widget.type === 'flex-separator') {
            previousVisibleWidget = null;
            slots.push(NO_THEME_SLOT);
            continue;
        }

        if (!entry.content) {
            slots.push(NO_THEME_SLOT);
            continue;
        }

        if (!previousVisibleWidget?.merge) {
            if (assignedAny) {
                slotIndex++;
            }

            assignedAny = true;
        }

        slots.push(slotIndex);
        previousVisibleWidget = entry.widget;
    }

    return slots;
}

export function countPowerlineThemeSlots(entries: PowerlineThemeSlotEntry[]): number {
    const assigned = assignPowerlineThemeSlots(entries).filter(slot => slot !== NO_THEME_SLOT);
    const lastSlot = assigned.at(-1);

    return lastSlot === undefined ? 0 : lastSlot + 1;
}

export function advanceGlobalPowerlineThemeIndex(currentIndex: number, entries: PowerlineThemeSlotEntry[]): number {
    return currentIndex + countPowerlineThemeSlots(entries);
}
