import type {
    Widget,
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

export function resetWidgetStyling(widgets: WidgetItem[], widgetId: string): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
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

        // Check if widget supports discrete values (dynamic color mode)
        const widgetImpl = getWidget(widget.type);
        const hasDiscreteValues = widgetImpl?.getDiscreteValues && widgetImpl.getDiscreteValues().length > 0;

        if (hasDiscreteValues) {
            return cycleWithDynamic(widget, widgetImpl, colors, direction);
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

// Extended color list for discrete-value widgets: normal colors + "Dynamic" pseudo-entry
const DYNAMIC_COLOR_SENTINEL = '__dynamic__';

function cycleWithDynamic(
    widget: WidgetItem,
    widgetImpl: Widget | undefined,
    colors: string[],
    direction: 'left' | 'right'
): WidgetItem {
    // Build extended list: normal colors + Dynamic sentinel
    const extendedColors = [...colors, DYNAMIC_COLOR_SENTINEL];
    const isDynamic = widget.metadata?.colorMode === 'dynamic';

    let currentIndex: number;
    if (isDynamic) {
        currentIndex = extendedColors.length - 1; // Dynamic is last
    } else {
        const defaultColor = getDefaultForegroundColor(widget);
        let currentColor = widget.color ?? defaultColor;
        if (currentColor === 'dim') {
            currentColor = defaultColor;
        }
        currentIndex = extendedColors.indexOf(currentColor);
        if (currentIndex === -1) {
            currentIndex = 0;
        }
    }

    const nextIndex = getNextIndex(currentIndex, extendedColors.length, direction);
    const nextValue = extendedColors[nextIndex];

    if (nextValue === DYNAMIC_COLOR_SENTINEL) {
        // Entering dynamic mode
        return {
            ...widget,
            metadata: {
                ...(widget.metadata ?? {}),
                colorMode: 'dynamic'
            }
        };
    }

    // Leaving dynamic mode or cycling normal colors
    const cleanedMetadata = Object.fromEntries(
        Object.entries(widget.metadata ?? {}).filter(([key]) => key !== 'colorMode')
    );
    const hasMetadata = Object.keys(cleanedMetadata).length > 0;

    return {
        ...widget,
        color: nextValue,
        metadata: hasMetadata ? cleanedMetadata : undefined
    };
}

export function setDiscreteValueColor(
    widgets: WidgetItem[],
    widgetId: string,
    discreteValue: string,
    color: string
): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, (widget) => {
        return {
            ...widget,
            metadata: {
                ...(widget.metadata ?? {}),
                ['colorMap:' + discreteValue]: color
            }
        };
    });
}

export function clearDiscreteValueColor(
    widgets: WidgetItem[],
    widgetId: string,
    discreteValue: string
): WidgetItem[] {
    const metadataKey = 'colorMap:' + discreteValue;
    return updateWidgetById(widgets, widgetId, (widget) => {
        const cleaned = Object.fromEntries(
            Object.entries(widget.metadata ?? {}).filter(([key]) => key !== metadataKey)
        );
        const hasMetadata = Object.keys(cleaned).length > 0;
        return {
            ...widget,
            metadata: hasMetadata ? cleaned : undefined
        };
    });
}