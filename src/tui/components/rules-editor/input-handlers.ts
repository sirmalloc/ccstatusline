import type { Settings } from '../../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetItem
} from '../../../types/Widget';
import type { InputKey } from '../../../utils/input-guards';
import {
    extractWidgetOverrides,
    mergeWidgetWithRuleApply
} from '../../../utils/widget-properties';
import {
    handleColorInput,
    type ColorEditorState
} from '../color-editor/input-handlers';
import {
    handleWidgetPropertyInput,
    type CustomEditorWidgetState
} from '../items-editor/input-handlers';

export type { InputKey };

export interface HandleRulePropertyInputArgs {
    input: string;
    key: InputKey;
    baseWidget: WidgetItem;
    rule: { when: Record<string, unknown>; apply: Record<string, unknown>; stop?: boolean };
    ruleIndex: number;
    onUpdate: (updatedWidget: WidgetItem) => void;
    getCustomKeybindsForWidget: (widgetImpl: Widget, widget: WidgetItem) => CustomKeybind[];
    setCustomEditorWidget?: (state: CustomEditorWidgetState | null) => void;
}

/**
 * Handle rule-specific property input keys: s (toggle stop), h (toggle hide), c (clear properties).
 * After handling rule-specific keys, delegates to the shared handleWidgetPropertyInput
 * for r (raw value), m (merge), and custom keybinds.
 *
 * All updates go through extractWidgetOverrides to store only diffs in rule.apply.
 */
export function handleRulePropertyInput({
    input,
    key,
    baseWidget,
    rule,
    ruleIndex,
    onUpdate,
    getCustomKeybindsForWidget,
    setCustomEditorWidget
}: HandleRulePropertyInputArgs): boolean {
    const rules = baseWidget.rules ?? [];

    // Toggle stop flag
    if (input === 's') {
        const newRules = [...rules];
        newRules[ruleIndex] = {
            ...rule,
            stop: !rule.stop
        };
        onUpdate({ ...baseWidget, rules: newRules });
        return true;
    }

    // Toggle hide flag
    if (input === 'h') {
        const tempWidget = mergeWidgetWithRuleApply(baseWidget, rule.apply);
        const updatedWidget = { ...tempWidget, hide: !tempWidget.hide };

        const newApply = extractWidgetOverrides(updatedWidget, baseWidget, rule.apply);
        const newRules = [...rules];
        newRules[ruleIndex] = {
            ...rule,
            apply: newApply
        };
        onUpdate({ ...baseWidget, rules: newRules });
        return true;
    }

    // Clear property overrides (preserve color/backgroundColor/bold/hide)
    if (input === 'c') {
        const newRules = [...rules];
        const { color, backgroundColor, bold, hide, ...restApply } = rule.apply;

        const newApply: Record<string, unknown> = {};
        if (color !== undefined) {
            newApply.color = color;
        }
        if (backgroundColor !== undefined) {
            newApply.backgroundColor = backgroundColor;
        }
        if (bold !== undefined) {
            newApply.bold = bold;
        }
        if (hide !== undefined) {
            newApply.hide = hide;
        }

        void restApply; // All other properties are cleared

        newRules[ruleIndex] = {
            ...rule,
            apply: newApply
        };
        onUpdate({ ...baseWidget, rules: newRules });
        return true;
    }

    // Delegate to shared widget property input handler (r, m, custom keybinds)
    const tempWidget = mergeWidgetWithRuleApply(baseWidget, rule.apply);

    return handleWidgetPropertyInput({
        input,
        key,
        widget: tempWidget,
        onUpdate: (updatedWidget) => {
            const newApply = extractWidgetOverrides(updatedWidget, baseWidget, rule.apply);
            const newRules = [...rules];
            newRules[ruleIndex] = {
                ...rule,
                apply: newApply
            };
            onUpdate({ ...baseWidget, rules: newRules });
        },
        getCustomKeybindsForWidget,
        setCustomEditorWidget
    });
}

// --- Color mode handler ---

export interface HandleRuleColorInputArgs {
    input: string;
    key: InputKey;
    baseWidget: WidgetItem;
    rule: { when: Record<string, unknown>; apply: Record<string, unknown>; stop?: boolean };
    ruleIndex: number;
    settings: Settings;
    colorEditorState: ColorEditorState;
    setColorEditorState: (updater: (prev: ColorEditorState) => ColorEditorState) => void;
    onUpdate: (updatedWidget: WidgetItem) => void;
}

/**
 * Handle color mode input for a rule.
 * Creates a temp widget via mergeWidgetWithRuleApply, delegates to shared handleColorInput,
 * and routes onUpdate/onReset callbacks through extractWidgetOverrides.
 *
 * The onReset callback resets to BASE WIDGET colors (widget.color, widget.backgroundColor,
 * widget.bold), not removing them entirely — this differs from widget-level color reset.
 */
export function handleRuleColorInput({
    input,
    key,
    baseWidget,
    rule,
    ruleIndex,
    settings,
    colorEditorState,
    setColorEditorState,
    onUpdate
}: HandleRuleColorInputArgs): boolean {
    const rules = baseWidget.rules ?? [];

    // Create temp widget by merging base + apply
    const tempWidget = mergeWidgetWithRuleApply(baseWidget, rule.apply);

    // Use shared color input handler
    return handleColorInput({
        input,
        key,
        widget: tempWidget,
        settings,
        state: colorEditorState,
        setState: setColorEditorState,
        onUpdate: (updatedWidget) => {
            // Extract what changed compared to base widget
            const newApply = extractWidgetOverrides(updatedWidget, baseWidget, rule.apply);
            const newRules = [...rules];
            newRules[ruleIndex] = {
                ...rule,
                apply: newApply
            };
            onUpdate({ ...baseWidget, rules: newRules });
        },
        onReset: () => {
            // Reset colors to base widget (remove color/backgroundColor/bold from apply)
            const resetWidget = {
                ...tempWidget,
                color: baseWidget.color,
                backgroundColor: baseWidget.backgroundColor,
                bold: baseWidget.bold
            };
            const newApply = extractWidgetOverrides(resetWidget, baseWidget, rule.apply);
            const newRules = [...rules];
            newRules[ruleIndex] = {
                ...rule,
                apply: newApply
            };
            onUpdate({ ...baseWidget, rules: newRules });
        }
    });
}

// --- Move mode handler ---

export interface HandleRuleMoveModeArgs {
    key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean };
    baseWidget: WidgetItem;
    selectedIndex: number;
    setSelectedIndex: (index: number) => void;
    setMoveMode: (moveMode: boolean) => void;
    onUpdate: (updatedWidget: WidgetItem) => void;
}

/**
 * Handle move mode input: swap rules on up/down arrows, exit on Enter/ESC.
 */
export function handleRuleMoveMode({
    key,
    baseWidget,
    selectedIndex,
    setSelectedIndex,
    setMoveMode,
    onUpdate
}: HandleRuleMoveModeArgs): void {
    const rules = baseWidget.rules ?? [];

    if (key.upArrow && selectedIndex > 0) {
        // Swap with rule above
        const newRules = [...rules];
        const currentRule = newRules[selectedIndex];
        const previousRule = newRules[selectedIndex - 1];
        if (!currentRule || !previousRule) {
            return;
        }
        newRules[selectedIndex] = previousRule;
        newRules[selectedIndex - 1] = currentRule;

        onUpdate({ ...baseWidget, rules: newRules });
        setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < rules.length - 1) {
        // Swap with rule below
        const newRules = [...rules];
        const currentRule = newRules[selectedIndex];
        const nextRule = newRules[selectedIndex + 1];
        if (!currentRule || !nextRule) {
            return;
        }
        newRules[selectedIndex] = nextRule;
        newRules[selectedIndex + 1] = currentRule;

        onUpdate({ ...baseWidget, rules: newRules });
        setSelectedIndex(selectedIndex + 1);
    } else if (key.escape || key.return) {
        setMoveMode(false);
    }
}

// --- Add/Delete rule functions ---

export interface AddRuleArgs {
    baseWidget: WidgetItem;
    setSelectedIndex: (index: number) => void;
    onUpdate: (updatedWidget: WidgetItem) => void;
}

/**
 * Add a new rule with placeholder condition { greaterThan: 50 } and empty apply.
 * Selects the newly added rule.
 */
export function addRule({
    baseWidget,
    setSelectedIndex,
    onUpdate
}: AddRuleArgs): void {
    const rules = baseWidget.rules ?? [];

    const newRule = {
        when: { greaterThan: 50 },
        apply: {},
        stop: false
    };

    const newRules = [...rules, newRule];
    onUpdate({ ...baseWidget, rules: newRules });
    setSelectedIndex(newRules.length - 1);
}

export interface DeleteRuleArgs {
    baseWidget: WidgetItem;
    selectedIndex: number;
    setSelectedIndex: (index: number) => void;
    onUpdate: (updatedWidget: WidgetItem) => void;
}

/**
 * Delete the rule at selectedIndex. Adjusts selection after delete:
 * if selectedIndex >= newRules.length, decrements by 1.
 */
export function deleteRule({
    baseWidget,
    selectedIndex,
    setSelectedIndex,
    onUpdate
}: DeleteRuleArgs): void {
    const rules = baseWidget.rules ?? [];

    if (rules.length === 0) {
        return;
    }

    const newRules = rules.filter((_, i) => i !== selectedIndex);
    onUpdate({ ...baseWidget, rules: newRules });

    // Adjust selection after delete (same pattern as ItemsEditor)
    if (selectedIndex >= newRules.length && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
    }
}

// --- Custom editor completion handler ---

export interface HandleRuleEditorCompleteArgs {
    updatedWidget: WidgetItem;
    baseWidget: WidgetItem;
    selectedIndex: number;
    onUpdate: (updatedWidget: WidgetItem) => void;
    setCustomEditorWidget: (state: CustomEditorWidgetState | null) => void;
}

/**
 * Handle custom editor widget completion while rules are expanded.
 * Routes the completed widget through extractWidgetOverrides so only
 * the diff is stored in rule.apply.
 */
export function handleRuleEditorComplete({
    updatedWidget,
    baseWidget,
    selectedIndex,
    onUpdate,
    setCustomEditorWidget
}: HandleRuleEditorCompleteArgs): void {
    const rules = baseWidget.rules ?? [];
    const rule = rules[selectedIndex];

    if (!rule) {
        setCustomEditorWidget(null);
        return;
    }

    // Extract what changed compared to base widget
    const newApply = extractWidgetOverrides(updatedWidget, baseWidget, rule.apply);
    const newRules = [...rules];
    newRules[selectedIndex] = {
        ...rule,
        apply: newApply
    };
    onUpdate({ ...baseWidget, rules: newRules });
    setCustomEditorWidget(null);
}