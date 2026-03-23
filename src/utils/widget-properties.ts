/**
 * Shared widget property mutation utilities
 *
 * These functions handle the cycling/toggling of widget properties
 * and are used by ItemsEditor to ensure consistent behavior.
 */

import type { WidgetItem } from '../types/Widget';

function isStringRecord(value: unknown): value is Record<string, string> {
    return typeof value === 'object'
        && value !== null
        && Object.values(value).every(entry => typeof entry === 'string');
}

/**
 * Merge base widget with rule.apply overrides, handling metadata deep merge
 *
 * IMPORTANT: This is the canonical way to merge widget + rule.apply.
 * The shallow spread operator `{ ...widget, ...apply }` loses metadata!
 *
 * @param widget - Base widget
 * @param apply - Rule.apply overrides
 * @returns Merged widget with deep-merged metadata
 */
export function mergeWidgetWithRuleApply(
    widget: WidgetItem,
    apply: Record<string, unknown>
): WidgetItem {
    const merged = { ...widget, ...apply };
    const applyMetadata = isStringRecord(apply.metadata) ? apply.metadata : undefined;

    // Deep merge metadata to preserve both base widget and rule metadata
    if (applyMetadata || widget.metadata) {
        merged.metadata = {
            ...(widget.metadata ?? {}),
            ...(applyMetadata ?? {})
        };
    }

    return merged;
}

/**
 * Cycle merge state through: undefined → true → 'no-padding' → undefined
 *
 * This is the canonical merge cycling logic used throughout the app.
 *
 * @param currentMerge - Current merge state
 * @returns Next merge state in the cycle
 */
export function cycleMergeState(
    currentMerge: boolean | 'no-padding' | undefined
): boolean | 'no-padding' | undefined {
    if (currentMerge === undefined) {
        return true;
    } else if (currentMerge === true) {
        return 'no-padding';
    } else {
        return undefined;
    }
}

/**
 * Apply merge state to a widget, removing the property if undefined
 *
 * @param widget - Widget to update
 * @param mergeState - New merge state (undefined removes the property)
 * @returns Updated widget
 */
export function applyMergeState(
    widget: WidgetItem,
    mergeState: boolean | 'no-padding' | undefined
): WidgetItem {
    if (mergeState === undefined) {
        const { merge, ...rest } = widget;
        void merge; // Intentionally unused
        return rest;
    } else {
        return { ...widget, merge: mergeState };
    }
}

/**
 * Toggle merge state for a widget (used by ItemsEditor)
 *
 * @param widget - Widget to toggle
 * @returns Updated widget
 */
export function toggleWidgetMerge(widget: WidgetItem): WidgetItem {
    const nextMergeState = cycleMergeState(widget.merge);
    return applyMergeState(widget, nextMergeState);
}

/**
 * Toggle raw value for a widget (used by ItemsEditor)
 *
 * @param widget - Widget to toggle
 * @returns Updated widget
 */
export function toggleWidgetRawValue(widget: WidgetItem): WidgetItem {
    return { ...widget, rawValue: !widget.rawValue };
}

/**
 * Extract property overrides for rule.apply by comparing updated widget to base widget
 *
 * Used by the accordion rules editor to determine what should be in rule.apply after widget modifications.
 * Only properties that differ from the base widget are included.
 * Properties that match the base are removed from the existing apply object.
 *
 * @param updatedWidget - Widget after modifications
 * @param baseWidget - Original widget before modifications
 * @param currentApply - Existing rule.apply object to update
 * @returns New apply object with only differing properties
 */
/**
 * Deep equality check for comparing values
 */
function isEqual(a: unknown, b: unknown): boolean {
    if (a === b)
        return true;
    if (a === null || a === undefined || b === null || b === undefined)
        return false;
    if (typeof a !== typeof b)
        return false;

    // For objects, do deep comparison
    if (typeof a === 'object' && typeof b === 'object') {
        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;

        const aKeys = Object.keys(aObj);
        const bKeys = Object.keys(bObj);

        if (aKeys.length !== bKeys.length)
            return false;

        return aKeys.every(key => isEqual(aObj[key], bObj[key]));
    }

    return false;
}

export function extractWidgetOverrides(
    updatedWidget: WidgetItem,
    baseWidget: WidgetItem,
    currentApply: Record<string, unknown>
): Record<string, unknown> {
    const newApply: Record<string, unknown> = {};

    // Get all keys we need to check: from updatedWidget, baseWidget, and currentApply
    const allKeys = new Set([
        ...Object.keys(updatedWidget),
        ...Object.keys(baseWidget),
        ...Object.keys(currentApply)
    ]);

    allKeys.forEach((key) => {
        // Skip structural properties that shouldn't be in rule.apply
        if (key === 'id' || key === 'type' || key === 'rules') {
            return;
        }

        const updatedValue = (updatedWidget as Record<string, unknown>)[key];
        const baseValue = (baseWidget as Record<string, unknown>)[key];

        // If different from widget base, add to rule.apply (use deep equality)
        if (!isEqual(updatedValue, baseValue)) {
            newApply[key] = updatedValue;
        }
        // Otherwise, it matches base, so don't include in apply
    });

    return newApply;
}