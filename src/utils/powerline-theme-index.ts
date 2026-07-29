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
 * This is the one place that decides which theme color a widget renders in. Every caller
 * - the powerline renderer, the color editor, and the theme customizer - reads its answer
 * from here, so they cannot disagree about which color a widget wears.
 *
 * Callers differ only in the `content` they supply, and that difference is deliberate.
 * The renderer and editor pass real rendered content, because a widget that renders
 * nothing takes no slot and shifts the ones after it. The customizer passes placeholder
 * content for every widget, because it bakes a color into each widget's config for all
 * future renders, including the ones where a currently-empty widget has output.
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
    // Index access rather than at(-1): package.json declares engines.node >=14 and the build
    // targets Node 14, which lowers syntax but does not polyfill prototype methods.
    const lastSlot = assigned[assigned.length - 1];

    return lastSlot === undefined ? 0 : lastSlot + 1;
}

export function advanceGlobalPowerlineThemeIndex(currentIndex: number, entries: PowerlineThemeSlotEntry[]): number {
    return currentIndex + countPowerlineThemeSlots(entries);
}

/**
 * Theme slot each line starts at, index-aligned with `lines`. Every line starts at 0
 * unless the theme continues across lines, in which case each line resumes where the
 * previous one stopped - the same accumulation the renderer's caller performs.
 *
 * The editor needs this because it renders one line at a time: without it, line 2 would
 * be previewed in line 1's colors.
 */
export function computeLineThemeStartIndices(
    lines: PowerlineThemeSlotEntry[][],
    continueThemeAcrossLines: boolean
): number[] {
    const startIndices: number[] = [];
    let startIndex = 0;

    for (const entries of lines) {
        startIndices.push(startIndex);
        if (continueThemeAcrossLines) {
            startIndex = advanceGlobalPowerlineThemeIndex(startIndex, entries);
        }
    }

    return startIndices;
}
