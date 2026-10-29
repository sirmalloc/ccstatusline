import type { NumberFormat } from '../../types/NumberFormat';
import { effectiveDecimals } from '../../utils/number-format';

const FALLBACK_CURRENCY = 'USD';

/**
 * Formats a monetary amount using the ISO 4217 currency code reported by the
 * usage API (extra_usage.currency), falling back to USD when absent or invalid.
 */
export function formatUsageCurrency(
    amount: number,
    currency: string | undefined,
    format: NumberFormat = {}
): string {
    const fractionDigits = effectiveDecimals(format, 2);
    const options: Intl.NumberFormatOptions = {
        style: 'currency',
        currency: currency ?? FALLBACK_CURRENCY,
        minimumFractionDigits: format.style === 'compact' ? 0 : fractionDigits,
        maximumFractionDigits: fractionDigits
    };

    try {
        return amount.toLocaleString('en-US', options);
    } catch {
        return amount.toLocaleString('en-US', {
            ...options,
            currency: FALLBACK_CURRENCY
        });
    }
}
