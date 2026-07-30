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

/**
 * Strip a widget's styling. While a theme is active only pinned channels are cleared,
 * for the same reason the editor refuses to cycle an unpinned channel: the stored color
 * of an unpinned channel is invisible under the theme, so wiping it would destroy a value
 * the user cannot see and would not miss until the theme was turned off. Bold and dim are
 * never theme-driven, so they always clear.
 */
function stripWidgetStyling(widget: WidgetItem, themeActive: boolean): WidgetItem {
    const {
        color,
        backgroundColor,
        bold,
        dim,
        pinColor,
        pinBackgroundColor,
        ...restWidget
    } = widget;
    void bold; // Intentionally unused
    void dim; // Intentionally unused

    if (!themeActive) {
        void color; // Intentionally unused
        void backgroundColor; // Intentionally unused
        void pinColor; // Intentionally unused
        void pinBackgroundColor; // Intentionally unused
        return restWidget;
    }

    // A pinned channel is the one the user can see and edit, so it clears along with its
    // pin. An unpinned channel's color is hidden by the theme - keep it.
    return {
        ...restWidget,
        ...(!pinColor && color !== undefined && { color }),
        ...(!pinBackgroundColor && backgroundColor !== undefined && { backgroundColor })
    };
}

export function resetWidgetStyling(widgets: WidgetItem[], widgetId: string, themeActive: boolean): WidgetItem[] {
    return updateWidgetById(widgets, widgetId, widget => stripWidgetStyling(widget, themeActive));
}

export function clearAllWidgetStyling(widgets: WidgetItem[], themeActive: boolean): WidgetItem[] {
    return widgets.map(widget => stripWidgetStyling(widget, themeActive));
}

function getDefaultForegroundColor(widget: WidgetItem): string {
    if (widget.type === 'separator' || widget.type === 'flex-separator') {
        return 'white';
    }

    const widgetImpl = getWidget(widget.type);
    return widgetImpl ? widgetImpl.getDefaultColor() : 'white';
}

/**
 * A pinned channel must always name a color. The pin suppresses the theme, so landing on
 * the palette's "Default" entry - the empty value - would leave the widget with nothing to
 * render at all: no theme color, and no color of its own. That entry is therefore not
 * offered while the channel is pinned; unpinning is how a channel goes back to the theme.
 */
function paletteForChannel(palette: string[], isPinned: boolean): string[] {
    return isPinned ? palette.filter(color => color !== '') : palette;
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
            const bgPalette = paletteForChannel(backgroundColors, Boolean(widget.pinBackgroundColor));
            if (bgPalette.length === 0) {
                return widget;
            }

            const currentBgColor = widget.backgroundColor ?? '';
            let currentBgColorIndex = bgPalette.indexOf(currentBgColor);
            if (currentBgColorIndex === -1) {
                currentBgColorIndex = 0;
            }

            const nextBgColorIndex = getNextIndex(currentBgColorIndex, bgPalette.length, direction);
            const nextBgColor = bgPalette[nextBgColorIndex];

            return {
                ...widget,
                backgroundColor: nextBgColor === '' ? undefined : nextBgColor
            };
        }

        const fgPalette = paletteForChannel(colors, Boolean(widget.pinColor));
        if (fgPalette.length === 0) {
            return widget;
        }

        const defaultColor = getDefaultForegroundColor(widget);
        let currentColor = widget.color ?? defaultColor;
        if (currentColor === 'dim') {
            currentColor = defaultColor;
        }

        let currentColorIndex = fgPalette.indexOf(currentColor);
        if (currentColorIndex === -1) {
            currentColorIndex = 0;
        }

        const nextColorIndex = getNextIndex(currentColorIndex, fgPalette.length, direction);
        const nextColor = fgPalette[nextColorIndex];

        return {
            ...widget,
            color: nextColor
        };
    });
}
