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