import {
    describe,
    expect,
    it
} from 'vitest';

import { countBudgetDaysLeft } from '../daily-budget';

function at(iso: string): number {
    return new Date(iso).getTime();
}

describe('countBudgetDaysLeft', () => {
    it('counts today through the last day of the month', () => {
        // Monday 5 October 2026: 5th to 31st inclusive.
        expect(countBudgetDaysLeft(at('2026-10-05T15:00:00Z'), false)).toBe(27);
    });

    it('counts only weekdays when asked, today included', () => {
        // Monday 5 October: today plus the 19 weekdays from the 6th to the 30th.
        expect(countBudgetDaysLeft(at('2026-10-05T15:00:00Z'), true)).toBe(20);
    });

    it('still counts a weekend today when weekdays only is on', () => {
        // Saturday 3 October: today plus the 20 weekdays from the 5th to the 30th.
        expect(countBudgetDaysLeft(at('2026-10-03T12:00:00Z'), true)).toBe(21);
        expect(countBudgetDaysLeft(at('2026-10-03T12:00:00Z'), false)).toBe(29);
    });

    it('counts one day on the last day of the month', () => {
        expect(countBudgetDaysLeft(at('2026-10-31T23:00:00Z'), false)).toBe(1);
        expect(countBudgetDaysLeft(at('2026-10-31T23:00:00Z'), true)).toBe(1);
    });

    // Monthly extra usage limits reset at 00:00 UTC on the 1st, so days are UTC
    // days: in US Central time the month (and each day) rolls over at 7pm.
    it('follows UTC days, so the new month starts at 00:00 UTC on the 1st', () => {
        // Sunday 1 November: 30 days; weekdays only is today plus the 21 weekdays
        // from the 2nd to the 30th.
        expect(countBudgetDaysLeft(at('2026-11-01T00:00:00Z'), false)).toBe(30);
        expect(countBudgetDaysLeft(at('2026-11-01T00:00:00Z'), true)).toBe(22);
        // 11:30pm on Friday 30 October in US Central time is already Saturday
        // the 31st in UTC: the month's last day.
        expect(countBudgetDaysLeft(at('2026-10-30T23:30:00-05:00'), true)).toBe(1);
    });
});
