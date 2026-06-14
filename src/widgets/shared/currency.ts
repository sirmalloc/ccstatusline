const FALLBACK_CURRENCY = 'USD';

/**
 * Formats a monetary amount using the ISO 4217 currency code reported by the
 * usage API (extra_usage.currency), falling back to USD when absent or invalid.
 */
export function formatUsageCurrency(amount: number, currency: string | undefined): string {
    try {
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency: currency ?? FALLBACK_CURRENCY,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } catch {
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency: FALLBACK_CURRENCY,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
}
