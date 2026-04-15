import type { RenderContext } from '../types/RenderContext';
import { DEFAULT_SETTINGS } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { getWidget } from './widgets';

/**
 * Parse a rendered string to extract numeric value
 * Handles:
 * 1. Numeric formats: "80%", "150K", "1.5M", "42", "Ctx: 80%", "(+42,-10)"
 * 2. Boolean strings: "true" → 1, "false" → 0
 * 3. Empty/null/unparseable: null, "", "(no git)" → null
 *
 * Does NOT parse strings that are primarily non-numeric:
 * - "claude-opus-4-6" → null (identifier, not a number)
 * - "main" → null (text, not a number)
 * - "feature/test" → null (text, not a number)
 */
function parseNumericValue(text: string | null): number | null {
    // Handle null/empty
    if (!text)
        return null;

    const cleaned = text.trim();
    if (!cleaned)
        return null;

    // Try boolean strings first (case-insensitive)
    const lower = cleaned.toLowerCase();
    if (lower === 'true')
        return 1;
    if (lower === 'false')
        return 0;

    // Try to extract number with optional suffix (anywhere in string)
    // Allow commas/underscores within the number (for formatting), but not at the end
    const match = /([+-]?[\d,._]*\d)\s*([KMB%])?/i.exec(cleaned);
    if (!match) {
        // Not a number, not a boolean - unparseable
        return null;
    }

    const [fullMatch, numStr, suffix] = match;
    if (!numStr)
        return null;

    // Check if this looks like an identifier rather than a numeric value
    // If there are word characters (letters/numbers) directly adjacent to the matched number
    // without clear separators, it's likely an identifier like "opus-4-6" or "v1.2.3"
    const beforeMatch = cleaned.substring(0, match.index);
    const afterMatch = cleaned.substring(match.index + fullMatch.length);

    // If there are letters immediately before the number (without separator), skip it
    // Exception: Allow common prefixes like "Ctx:" or "Cost:"
    if (beforeMatch && /[a-zA-Z]$/.test(beforeMatch)) {
        // Check if it's a common label pattern (ends with space, colon, or parenthesis)
        if (!/[:(\s]$/.test(beforeMatch)) {
            return null;
        }
    }

    // If there are letters or more digits immediately after (without separator), skip it
    // This catches "opus-4-6" where we match "4" but there's "-6" after
    if (afterMatch && /^[a-zA-Z\d-]/.test(afterMatch)) {
        // Exception: Allow trailing closing parenthesis or comma (common in formatted output)
        if (!/^[),\s]/.test(afterMatch)) {
            return null;
        }
    }

    // Parse base number (remove commas, handle dots/underscores)
    const baseNum = parseFloat(numStr.replace(/[,_]/g, ''));
    if (isNaN(baseNum))
        return null;

    // Apply multiplier based on suffix
    switch (suffix?.toUpperCase()) {
        case 'K':
            return baseNum * 1000;
        case 'M':
            return baseNum * 1000000;
        case 'B':
            return baseNum * 1000000000;
        case '%':
            return baseNum;  // Keep percentage as-is (80% → 80)
        default:
            return baseNum;
    }
}

/**
 * Extract numeric value from a widget for condition evaluation
 *
 * Strategy:
 * 1. If widget implements getNumericValue(), use that (for precision)
 * 2. Otherwise, render the widget and parse the string (default behavior)
 */
export function getWidgetNumericValue(
    widgetType: string,
    context: RenderContext,
    item: WidgetItem
): number | null {
    const widget = getWidget(widgetType);
    if (!widget)
        return null;

    // Try explicit value method first (new pattern)
    if (widget.getValue && widget.getValueType?.() === 'number') {
        const value = widget.getValue(context, item);
        return typeof value === 'number' ? value : null;
    }

    // Default: render and parse
    // Use raw value mode to get numeric data without labels
    const rawItem = { ...item, rawValue: true };
    const rendered = widget.render(rawItem, context, DEFAULT_SETTINGS);
    const parsed = parseNumericValue(rendered);

    // Debug logging
    if (process.env.DEBUG_RULES === 'true') {
        console.log(`Widget ${widgetType}: rendered="${rendered}" parsed=${parsed}`);
    }

    return parsed;
}

/**
 * Extract string value from a widget for condition evaluation
 *
 * Renders the widget in raw value mode and returns the text output
 */
export function getWidgetStringValue(
    widgetType: string,
    context: RenderContext,
    item: WidgetItem
): string | null {
    const widget = getWidget(widgetType);
    if (!widget)
        return null;

    // Render in raw value mode to get clean text without labels
    const rawItem = { ...item, rawValue: true };
    const rendered = widget.render(rawItem, context, DEFAULT_SETTINGS);

    // Return rendered text (null if empty)
    return rendered && rendered.trim() !== '' ? rendered.trim() : null;
}

/**
 * Extract boolean value from a widget for condition evaluation
 *
 * Handles known boolean widgets and parses boolean strings
 */
export function getWidgetBooleanValue(
    widgetType: string,
    context: RenderContext,
    item: WidgetItem
): boolean | null {
    const widget = getWidget(widgetType);
    if (!widget)
        return null;

    // For git-changes, check if there are any changes
    if (widgetType === 'git-changes') {
        // Get numeric value and check if > 0
        const numValue = getWidgetNumericValue(widgetType, context, item);
        if (numValue !== null) {
            return numValue > 0;
        }
        return null;
    }

    // Try to parse as boolean from rendered output
    const rawItem = { ...item, rawValue: true };
    const rendered = widget.render(rawItem, context, DEFAULT_SETTINGS);
    if (!rendered)
        return null;

    const cleaned = rendered.trim().toLowerCase();
    if (cleaned === 'true')
        return true;
    if (cleaned === 'false')
        return false;

    // Not a boolean value
    return null;
}

/**
 * Generic value extraction - returns the widget's primary value type
 *
 * This is the main entry point for rule condition evaluation.
 * Priority order:
 * 1. Numeric - for numbers, percentages, counts (most common)
 * 2. String - for text values
 *
 * Note: Boolean conversion happens in condition evaluation, not here.
 * Numbers can be treated as booleans (0=false, non-zero=true) by the evaluator.
 */
export function getWidgetValue(
    widgetType: string,
    context: RenderContext,
    item: WidgetItem
): number | string | boolean | null {
    // Try numeric first (most widgets have numeric values)
    const numericValue = getWidgetNumericValue(widgetType, context, item);
    if (numericValue !== null)
        return numericValue;

    // Fall back to string
    return getWidgetStringValue(widgetType, context, item);
}

/**
 * Check if a widget type supports numeric value extraction
 */
export function supportsNumericValue(widgetType: string): boolean {
    const widget = getWidget(widgetType);
    // All widgets support it via default parsing behavior
    return !!widget;
}