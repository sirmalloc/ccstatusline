import type {
    Rule,
    WidgetItem
} from '../../../types/Widget';
import { getWidget } from '../../../utils/widgets';

export function updateWidgetById(
    widgets: WidgetItem[],
    widgetId: string,
    updater: (widget: WidgetItem) => WidgetItem
): WidgetItem[] {
    return widgets.map(widget => widget.id === widgetId ? updater(widget) : widget);
}

function updateRuleApply(
    widget: WidgetItem,
    ruleIndex: number,
    applyUpdater: (rule: Rule) => Rule
): WidgetItem {
    const rules = widget.rules;
    if (!rules || ruleIndex < 0 || ruleIndex >= rules.length) {
        return widget;
    }

    const updatedRules = rules.map((rule, i) => i === ruleIndex ? applyUpdater(rule) : rule);

    return { ...widget, rules: updatedRules };
}

export function setWidgetColor(
    widgets: WidgetItem[],
    widgetId: string,
    color: string,
    editingBackground: boolean,
    ruleIndex?: number
): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (ruleIndex !== undefined) {
            return updateRuleApply(widget, ruleIndex, rule => ({
                ...rule,
                apply: {
                    ...rule.apply,
                    ...(editingBackground
                        ? { backgroundColor: color }
                        : { color })
                }
            }));
        }

        if (editingBackground) {
            return {
                ...widget,
                backgroundColor: color
            };
        }

        return {
            ...widget,
            color
        };
    });
}

export function toggleWidgetBold(widgets: WidgetItem[], widgetId: string, ruleIndex?: number): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (ruleIndex !== undefined) {
            return updateRuleApply(widget, ruleIndex, rule => ({
                ...rule,
                apply: {
                    ...rule.apply,
                    bold: !rule.apply.bold
                }
            }));
        }

        return {
            ...widget,
            bold: !widget.bold
        };
    });
}

export function resetWidgetStyling(widgets: WidgetItem[], widgetId: string, ruleIndex?: number): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (ruleIndex !== undefined) {
            return updateRuleApply(widget, ruleIndex, (rule) => {
                const {
                    color,
                    backgroundColor,
                    bold,
                    ...restApply
                } = rule.apply;
                void color;
                void backgroundColor;
                void bold;
                return { ...rule, apply: restApply };
            });
        }

        const {
            color,
            backgroundColor,
            bold,
            ...restWidget
        } = widget;
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void bold; // Intentionally unused
        return restWidget;
    });
}

export function clearAllWidgetStyling(widgets: WidgetItem[]): WidgetItem[] {
    return widgets.map((widget) => {
        const {
            color,
            backgroundColor,
            bold,
            ...restWidget
        } = widget;
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void bold; // Intentionally unused
        return restWidget;
    });
}

function getDefaultForegroundColor(widget: WidgetItem): string {
    if (widget.type === 'separator' || widget.type === 'flex-separator') {
        return 'white';
    }

    const widgetImpl = getWidget(widget.type);
    return widgetImpl ? widgetImpl.getDefaultColor() : 'white';
}

function getNextIndex(currentIndex: number, length: number, direction: 'left' | 'right'): number {
    if (direction === 'right') {
        return (currentIndex + 1) % length;
    }

    return currentIndex === 0 ? length - 1 : currentIndex - 1;
}

export interface CycleWidgetColorOptions {
    widgets: WidgetItem[];
    widgetId: string;
    direction: 'left' | 'right';
    editingBackground: boolean;
    colors: string[];
    backgroundColors: string[];
    ruleIndex?: number;
}

export function cycleWidgetColor({
    widgets,
    widgetId,
    direction,
    editingBackground,
    colors,
    backgroundColors,
    ruleIndex
}: CycleWidgetColorOptions): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (ruleIndex !== undefined) {
            return updateRuleApply(widget, ruleIndex, (rule) => {
                if (editingBackground) {
                    if (backgroundColors.length === 0) {
                        return rule;
                    }

                    const currentBgColor = rule.apply.backgroundColor ?? widget.backgroundColor ?? '';
                    let currentBgColorIndex = backgroundColors.indexOf(currentBgColor);
                    if (currentBgColorIndex === -1) {
                        currentBgColorIndex = 0;
                    }

                    const nextBgColorIndex = getNextIndex(currentBgColorIndex, backgroundColors.length, direction);
                    const nextBgColor = backgroundColors[nextBgColorIndex];

                    return {
                        ...rule,
                        apply: {
                            ...rule.apply,
                            backgroundColor: nextBgColor === '' ? undefined : nextBgColor
                        }
                    };
                }

                if (colors.length === 0) {
                    return rule;
                }

                const defaultColor = getDefaultForegroundColor(widget);
                let currentColor = rule.apply.color ?? widget.color ?? defaultColor;
                if (currentColor === 'dim') {
                    currentColor = defaultColor;
                }

                let currentColorIndex = colors.indexOf(currentColor);
                if (currentColorIndex === -1) {
                    currentColorIndex = 0;
                }

                const nextColorIndex = getNextIndex(currentColorIndex, colors.length, direction);
                const nextColor = colors[nextColorIndex];

                return {
                    ...rule,
                    apply: {
                        ...rule.apply,
                        color: nextColor
                    }
                };
            });
        }

        if (editingBackground) {
            if (backgroundColors.length === 0) {
                return widget;
            }

            const currentBgColor = widget.backgroundColor ?? '';
            let currentBgColorIndex = backgroundColors.indexOf(currentBgColor);
            if (currentBgColorIndex === -1) {
                currentBgColorIndex = 0;
            }

            const nextBgColorIndex = getNextIndex(currentBgColorIndex, backgroundColors.length, direction);
            const nextBgColor = backgroundColors[nextBgColorIndex];

            return {
                ...widget,
                backgroundColor: nextBgColor === '' ? undefined : nextBgColor
            };
        }

        if (colors.length === 0) {
            return widget;
        }

        const defaultColor = getDefaultForegroundColor(widget);
        let currentColor = widget.color ?? defaultColor;
        if (currentColor === 'dim') {
            currentColor = defaultColor;
        }

        let currentColorIndex = colors.indexOf(currentColor);
        if (currentColorIndex === -1) {
            currentColorIndex = 0;
        }

        const nextColorIndex = getNextIndex(currentColorIndex, colors.length, direction);
        const nextColor = colors[nextColorIndex];

        return {
            ...widget,
            color: nextColor
        };
    });
}
