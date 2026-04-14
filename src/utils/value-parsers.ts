/**
 * Parse helpers for converting widget raw output to typed values.
 * These are pure functions with no widget or context dependencies.
 */

/**
 * Parse a percentage string (e.g., '9.3%' → 9.3)
 * Strips trailing '%' and returns the number.
 */
export function parsePercentage(value: string): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;

    // Validate that it's a valid number format (optional minus, digits, optional single decimal point and more digits)
    if (!/^-?\d+(\.\d+)?$/.test(withoutPercent)) {
        return null;
    }

    const parsed = parseFloat(withoutPercent);

    if (isNaN(parsed)) {
        return null;
    }

    return parsed;
}

/**
 * Parse a currency string (e.g., '$2.45' → 2.45, '€10.00' → 10.0)
 * Strips leading non-digit characters (any currency symbol) and parses the rest.
 */
export function parseCurrency(value: string): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    // Strip leading non-digit characters (including currency symbols)
    const withoutSymbol = trimmed.replace(/^[^\d.-]+/, '');

    // Validate that it's a valid number format
    if (!/^-?\d+(\.\d+)?$/.test(withoutSymbol)) {
        return null;
    }

    const parsed = parseFloat(withoutSymbol);

    if (isNaN(parsed)) {
        return null;
    }

    return parsed;
}

/**
 * Parse a token count string with K/M/B suffixes (case-insensitive)
 * Examples: '15.2k' → 15200, '1.5M' → 1500000, '42' → 42
 */
export function parseTokenCount(value: string): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    const match = /^(\d+(?:\.\d+)?)([kmb])?$/i.exec(trimmed);

    if (!match?.[1]) {
        return null;
    }

    const num = parseFloat(match[1]);
    if (isNaN(num)) {
        return null;
    }

    const suffixRaw = match[2];
    if (!suffixRaw) {
        return num;
    }

    const suffix = suffixRaw.toLowerCase();
    const multipliers: Record<string, number> = {
        k: 1000,
        m: 1000000,
        b: 1000000000
    };

    const multiplier = multipliers[suffix];
    if (multiplier === undefined) {
        return null;
    }

    return num * multiplier;
}

/**
 * Parse a speed string (e.g., '85.2 t/s' → 85.2)
 * Strips trailing ' t/s' suffix and parses the number.
 */
export function parseSpeed(value: string): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    const withoutSuffix = trimmed.replace(/\s*t\/s$/i, '');

    // Validate that it's a valid number format
    if (!/^-?\d+(\.\d+)?$/.test(withoutSuffix)) {
        return null;
    }

    const parsed = parseFloat(withoutSuffix);

    if (isNaN(parsed)) {
        return null;
    }

    return parsed;
}

/**
 * Parse boolean strings ('true'/'false', case-insensitive)
 * Returns null for anything else.
 */
export function parseBooleanString(value: string): boolean | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim().toLowerCase();

    if (trimmed === 'true') {
        return true;
    }

    if (trimmed === 'false') {
        return false;
    }

    return null;
}

/**
 * Parse an integer string safely.
 * Returns null for non-integer or floating-point input.
 */
export function parseIntSafe(value: string): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();

    // Check if the string contains a decimal point (floating-point)
    if (trimmed.includes('.')) {
        return null;
    }

    const parsed = parseInt(trimmed, 10);

    // Validate that the parsed value is a valid integer
    // and that the original string represents the same number
    if (isNaN(parsed) || trimmed !== String(parsed)) {
        return null;
    }

    return parsed;
}