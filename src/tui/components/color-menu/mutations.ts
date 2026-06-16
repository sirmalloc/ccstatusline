import type {
    NumberFormat,
    NumberStyle
} from '../../../types/NumberFormat';
import type { WidgetItem } from '../../../types/Widget';
import { getWidget } from '../../../utils/widgets';

export function updateWidgetById(
    widgets: WidgetItem[],
    widgetId: string,
    updater: (widget: WidgetItem) => WidgetItem
): WidgetItem[] {
    return widgets.map(widget => widget.id === widgetId ? updater(widget) : widget);
}

export function setWidgetColor(
    widgets: WidgetItem[],
    widgetId: string,
    color: string,
    editingBackground: boolean
): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
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

export function toggleWidgetBold(widgets: WidgetItem[], widgetId: string): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, widget => ({
        ...widget,
        bold: !widget.bold
    }));
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

export function cycleWidgetNumberStyle(widgets: WidgetItem[], widgetId: string): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        // Cycle the number style: default (precise) -> compact -> whole -> default.
        // Any explicit `decimals` is preserved across the cycle.
        const currentStyle = widget.numberFormat?.style;
        const nextStyle: NumberStyle | undefined = currentStyle === undefined
            ? 'compact'
            : currentStyle === 'compact'
                ? 'whole'
                : undefined;
        const decimals = widget.numberFormat?.decimals;

        if (nextStyle === undefined && decimals === undefined) {
            const { numberFormat, ...restWidget } = widget;
            void numberFormat; // Intentionally unused
            return restWidget;
        }

        const nextFormat: NumberFormat = {};
        if (nextStyle !== undefined) {
            nextFormat.style = nextStyle;
        }
        if (decimals !== undefined) {
            nextFormat.decimals = decimals;
        }
        return {
            ...widget,
            numberFormat: nextFormat
        };
    });
}

export function resetWidgetStyling(widgets: WidgetItem[], widgetId: string): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        const {
            color,
            backgroundColor,
            bold,
            dim,
            numberFormat,
            ...restWidget
        } = widget;
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void bold; // Intentionally unused
        void dim; // Intentionally unused
        void numberFormat; // Intentionally unused
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
            numberFormat,
            ...restWidget
        } = widget;
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void bold; // Intentionally unused
        void dim; // Intentionally unused
        void numberFormat; // Intentionally unused
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
}

export function cycleWidgetColor({
    widgets,
    widgetId,
    direction,
    editingBackground,
    colors,
    backgroundColors
}: CycleWidgetColorOptions): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
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
