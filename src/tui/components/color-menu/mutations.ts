import type {
    RuleApply,
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

/**
 * Applies an update to one of a widget's rules. Rule edits target rule.apply so the widget's
 * own styling stays as the unconditional base the rules override. Out-of-range indexes leave
 * the widget untouched rather than growing the list.
 */
function updateRuleApply(
    widget: WidgetItem,
    ruleIndex: number,
    applyUpdater: (apply: RuleApply) => RuleApply
): WidgetItem {
    const rules = widget.rules;
    if (!rules || ruleIndex < 0 || ruleIndex >= rules.length) {
        return widget;
    }

    return {
        ...widget,
        rules: rules.map((rule, index) => index === ruleIndex
            ? { ...rule, apply: applyUpdater(rule.apply) }
            : rule)
    };
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
            return updateRuleApply(widget, ruleIndex, apply => (editingBackground
                ? { ...apply, backgroundColor: color }
                : { ...apply, color }));
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

export function pinWidgetColor(
    widgets: WidgetItem[],
    widgetId: string,
    isBackground: boolean,
    seedColor: string
): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (isBackground) {
            return {
                ...widget,
                pinBackgroundColor: true,
                backgroundColor: widget.backgroundColor ?? seedColor
            };
        }

        return {
            ...widget,
            pinColor: true,
            color: widget.color ?? seedColor
        };
    });
}

export function unpinWidgetColor(
    widgets: WidgetItem[],
    widgetId: string,
    isBackground: boolean
): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (isBackground) {
            const { pinBackgroundColor, ...restWidget } = widget;
            void pinBackgroundColor; // Intentionally unused
            return restWidget;
        }

        const { pinColor, ...restWidget } = widget;
        void pinColor; // Intentionally unused
        return restWidget;
    });
}

export function clearAllPins(widgets: WidgetItem[]): WidgetItem[] {
    return widgets.map((widget) => {
        const {
            pinColor,
            pinBackgroundColor,
            ...restWidget
        } = widget;
        void pinColor; // Intentionally unused
        void pinBackgroundColor; // Intentionally unused
        return restWidget;
    });
}

export function toggleWidgetBold(widgets: WidgetItem[], widgetId: string, ruleIndex?: number): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (ruleIndex !== undefined) {
            return updateRuleApply(widget, ruleIndex, apply => ({ ...apply, bold: !apply.bold }));
        }

        return {
            ...widget,
            bold: !widget.bold
        };
    });
}

export function cycleWidgetDim(widgets: WidgetItem[], widgetId: string): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        // Cycle: off -> whole widget -> (...) spans only -> off
        if (widget.dim === true) {
            return {
                ...widget,
                dim: 'parens' as const
            };
        }

        if (widget.dim === 'parens') {
            const { dim, ...restWidget } = widget;
            void dim; // Intentionally unused
            return restWidget;
        }

        return {
            ...widget,
            dim: true
        };
    });
}

export function resetWidgetStyling(widgets: WidgetItem[], widgetId: string, ruleIndex?: number): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        if (ruleIndex !== undefined) {
            return updateRuleApply(widget, ruleIndex, () => ({}));
        }

        const {
            color,
            backgroundColor,
            bold,
            dim,
            pinColor,
            pinBackgroundColor,
            ...restWidget
        } = widget;
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void bold; // Intentionally unused
        void dim; // Intentionally unused
        void pinColor; // Intentionally unused
        void pinBackgroundColor; // Intentionally unused
        return restWidget;
    });
}

export function clearAllWidgetStyling(widgets: WidgetItem[]): WidgetItem[] {
    return widgets.map((widget) => {
        const {
            color,
            backgroundColor,
            bold,
            dim,
            pinColor,
            pinBackgroundColor,
            ...restWidget
        } = widget;
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void bold; // Intentionally unused
        void dim; // Intentionally unused
        void pinColor; // Intentionally unused
        void pinBackgroundColor; // Intentionally unused
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
    /** Aims the edit at one of the widget's rules instead of the widget itself. */
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
            const palette = editingBackground ? backgroundColors : colors;
            if (palette.length === 0) {
                return widget;
            }

            return updateRuleApply(widget, ruleIndex, (apply) => {
                const current = (editingBackground ? apply.backgroundColor : apply.color) ?? '';
                const currentIndex = palette.indexOf(current);
                const next = palette[getNextIndex(currentIndex === -1 ? 0 : currentIndex, palette.length, direction)];
                const value = next === '' ? undefined : next;

                return editingBackground
                    ? { ...apply, backgroundColor: value }
                    : { ...apply, color: value };
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
