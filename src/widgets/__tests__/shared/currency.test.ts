import {
    describe,
    expect,
    it
} from 'vitest';

import { formatUsageCurrency } from '../../shared/currency';

describe('formatUsageCurrency', () => {
    it('defaults to USD when no currency is reported', () => {
        expect(formatUsageCurrency(3894, undefined)).toBe('$3,894.00');
    });

    it('formats known ISO 4217 currency codes', () => {
        expect(formatUsageCurrency(3894, 'USD')).toBe('$3,894.00');
        expect(formatUsageCurrency(3894, 'EUR')).toBe('€3,894.00');
        expect(formatUsageCurrency(5.42, 'GBP')).toBe('£5.42');
    });

    it('falls back to USD for invalid currency codes', () => {
        expect(formatUsageCurrency(3894, 'not-a-currency')).toBe('$3,894.00');
    });
});
