import type { RenderContext } from '../types/RenderContext';
import { DEFAULT_SETTINGS } from '../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../types/Widget';

import { getWidget } from './widgets';

/**
 * Shared helper that renders a widget with rawValue:true using DEFAULT_SETTINGS,
 * then applies the provided parser to the output.
 *
 * Returns null if the widget renders null or empty string.
 */
export function getValueFromRender(
    widget: Widget,
    context: RenderContext,
    item: WidgetItem,
    parser: (value: string) => number | boolean | null
): number | boolean | null {
    const renderItem = { ...item, rawValue: true };
    const rendered = widget.render(renderItem, context, DEFAULT_SETTINGS);

    if (rendered === null || rendered.trim() === '') {
        return null;
    }

    return parser(rendered.trim());
}

/**
 * Extract a widget's value using typed dispatch.
 *
 * Strategy:
 * 1. If the widget implements getValue(), call it and return the typed result
 * 2. Otherwise, fall back to rendering in raw mode (if supported) and returning
 *    the string. This handles widgets like GitBranch, Model, etc. that don't
 *    declare a value type but still have useful string values for rules.
 *
 * This is the main entry point for rule condition evaluation.
 */
export function getWidgetValue(
    widgetType: string,
    context: RenderContext,
    item: WidgetItem
): number | string | boolean | null {
    const widget = getWidget(widgetType);
    if (!widget)
        return null;

    // Typed dispatch: if widget declares getValue(), use it directly
    if (widget.getValue) {
        return widget.getValue(context, item);
    }

    // Fallback: render the widget and return the string output
    // Use raw value mode if supported, otherwise render normally
    const renderItem = widget.supportsRawValue() ? { ...item, rawValue: true } : item;
    const rendered = widget.render(renderItem, context, DEFAULT_SETTINGS);

    // Return rendered text (null if empty)
    return rendered && rendered.trim() !== '' ? rendered.trim() : null;
}
