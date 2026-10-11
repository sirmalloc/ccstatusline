import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

export interface PowerlineThemeSlotEntry {
    content: string;
    widget: WidgetItem;
}

export interface PowerlineThemeSlots {
    slots: (number | null)[];
    nextSlot: number;
}

// Theme color slot of each widget in a line, numbered from startSlot. A widget
// merged into the previous shown widget shares its slot; separators and hidden
// widgets get none. nextSlot is where the following line continues.
export function assignPowerlineThemeSlots(
    widgets: WidgetItem[],
    startSlot = 0,
    isShown: (index: number) => boolean = () => true
): PowerlineThemeSlots {
    let previousVisibleWidget: WidgetItem | null = null;
    let nextSlot = startSlot;

    const slots = widgets.map((widget, index) => {
        if (widget.type === 'separator' || widget.type === 'flex-separator') {
            previousVisibleWidget = null;
            return null;
        }

        if (!isShown(index)) {
            return null;
        }

        if (!previousVisibleWidget?.merge) {
            nextSlot++;
        }

        previousVisibleWidget = widget;
        return nextSlot - 1;
    });

    return { slots, nextSlot };
}

export function countPowerlineThemeSlots(entries: PowerlineThemeSlotEntry[]): number {
    return assignPowerlineThemeSlots(
        entries.map(entry => entry.widget),
        0,
        index => Boolean(entries[index]?.content)
    ).nextSlot;
}

export function advanceGlobalPowerlineThemeIndex(currentIndex: number, entries: PowerlineThemeSlotEntry[]): number {
    return currentIndex + countPowerlineThemeSlots(entries);
}

// True when line `lineIndex` carries its own theme ('none' counts: it is an
// explicit per-line setting, not an inherit-from-global fallback).
export function hasOwnLineTheme(settings: Pick<Settings, 'lineThemes'>, lineIndex: number): boolean {
    const theme = settings.lineThemes?.[lineIndex];
    return theme !== undefined && theme !== null;
}
