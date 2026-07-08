import type {
    NumberFormat,
    NumberKind
} from '../types/NumberFormat';
import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

// Strip a pointless trailing ".0" (or ".00", ...) so a whole value reads cleanly
// while a meaningful fraction is left intact.
//   "512.0" -> "512"   "1.0" -> "1"   "5.2" -> "5.2"   "711" -> "711"
function trimTrailingZeros(value: string): string {
    return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

// Decimal count a format resolves to over a tier's baseline precision.
export function effectiveDecimals(format: NumberFormat, baselineDecimals: number): number {
    if (format.style === 'whole')
        return 0;
    return format.decimals ?? baselineDecimals;
}

// Render a magnitude value (already divided into its k/M/G unit, or a bare
// percentage/cost) to its numeric string under `format`. `baselineDecimals` is
// the caller's own default precision, used when the format leaves it unset. An
// empty format reproduces the caller's current output.
export function renderMagnitude(value: number, format: NumberFormat, baselineDecimals: number): string {
    const fixed = value.toFixed(effectiveDecimals(format, baselineDecimals));
    return format.style === 'compact' ? trimTrailingZeros(fixed) : fixed;
}

// Render a percentage. `baselineDecimals` defaults to 1 ("84.5%"); callers that
// want a whole-percent baseline (e.g. a context bar) pass 0.
export function formatPercent(value: number, format: NumberFormat = {}, baselineDecimals = 1): string {
    return `${renderMagnitude(value, format, baselineDecimals)}%`;
}

// Render a USD cost (baseline 2 decimals: "$1.20").
export function formatCost(value: number, format: NumberFormat = {}): string {
    return `$${renderMagnitude(value, format, 2)}`;
}

// Resolve the effective format for a widget of the given kind. A global entry for
// the kind wins outright; otherwise the widget's own value; otherwise an empty
// format (formatter baseline = current output).
export function resolveNumberFormat(kind: NumberKind, item: WidgetItem, settings: Settings): NumberFormat {
    return settings.numberFormat?.[kind] ?? item.numberFormat ?? {};
}
