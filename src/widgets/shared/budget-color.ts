import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const BUDGET_COLORS_KEY = 'budgetColors';
const TOGGLE_BUDGET_COLORS_ACTION = 'toggle-budget-colors';

const OK_COLOR_KEY = 'budgetColorOk';
const WARN_COLOR_KEY = 'budgetColorWarn';
const CRIT_COLOR_KEY = 'budgetColorCrit';

// Utilization (used/limit, 0-100) at which the color escalates.
const WARN_AT_PERCENT = 75;
const CRIT_AT_PERCENT = 90;

const DEFAULT_OK_COLOR = 'green';
const DEFAULT_WARN_COLOR = 'yellow';
const DEFAULT_CRIT_COLOR = 'red';

const BUDGET_COLORS_KEYBIND: CustomKeybind = {
    key: 'b',
    label: '(b)udget colors',
    action: TOGGLE_BUDGET_COLORS_ACTION
};

export function isBudgetColorsEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, BUDGET_COLORS_KEY);
}

export function handleToggleBudgetColorsAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action !== TOGGLE_BUDGET_COLORS_ACTION) {
        return null;
    }

    return toggleMetadataFlag(item, BUDGET_COLORS_KEY);
}

export function getBudgetColorsKeybind(): CustomKeybind {
    return BUDGET_COLORS_KEYBIND;
}

export function appendBudgetColorsModifier(modifierText: string | undefined, item: WidgetItem): string | undefined {
    if (!isBudgetColorsEnabled(item)) {
        return modifierText;
    }

    if (!modifierText) {
        return '(budget colors)';
    }

    return `${modifierText.slice(0, -1)}, budget colors)`;
}

/**
 * The severity color for a budget widget at the given utilization percentage
 * (used / limit, 0-100). Returns undefined when the opt-in flag is off or the
 * utilization is unknown, so the widget keeps its statically configured color.
 * Higher utilization is more problematic: the configured ok color below the warn
 * threshold, the warn color up to critical, the critical color at or beyond it.
 * Each tier defaults to a plain ANSI color and is overridable via metadata.
 */
export function resolveBudgetColor(item: WidgetItem, utilizationPercent: number | undefined): string | undefined {
    if (!isBudgetColorsEnabled(item) || utilizationPercent === undefined) {
        return undefined;
    }

    if (utilizationPercent >= CRIT_AT_PERCENT) {
        return item.metadata?.[CRIT_COLOR_KEY] ?? DEFAULT_CRIT_COLOR;
    }

    if (utilizationPercent >= WARN_AT_PERCENT) {
        return item.metadata?.[WARN_COLOR_KEY] ?? DEFAULT_WARN_COLOR;
    }

    return item.metadata?.[OK_COLOR_KEY] ?? DEFAULT_OK_COLOR;
}
