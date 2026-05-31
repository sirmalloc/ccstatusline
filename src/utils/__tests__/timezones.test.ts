import {
    describe,
    expect,
    it
} from 'vitest';

import {
    filterTimezoneOptions,
    getLocalTimezone,
    getTimezoneMatchSegments,
    getTimezoneOptions,
    isValidTimezone
} from '../timezones';

describe('timezone helpers', () => {
    it('includes default UTC and local timezone options first', () => {
        const options = getTimezoneOptions();

        expect(options[0]?.value).toBe('UTC');
        expect(options[1]?.value).toBe('local');
        expect(options[1]?.displayName).toContain('Local');
    });

    it('lists native IANA timezones when available', () => {
        const options = getTimezoneOptions();
        const hasNativeTimezoneList = typeof Intl.supportedValuesOf === 'function';

        if (hasNativeTimezoneList) {
            expect(options.some(option => option.value === 'Asia/Tokyo')).toBe(true);
        }
    });

    it('filters timezone options with fuzzy matching', () => {
        const options = getTimezoneOptions();
        const matches = filterTimezoneOptions(options, 'tokyo');

        if (typeof Intl.supportedValuesOf === 'function') {
            expect(matches[0]?.value).toBe('Asia/Tokyo');
        } else {
            expect(matches).toHaveLength(0);
        }
    });

    it('highlights timezone match segments', () => {
        const segments = getTimezoneMatchSegments('America/New_York', 'ny');

        expect(segments.some(segment => segment.text === 'N' && segment.matched)).toBe(true);
        expect(segments.some(segment => segment.text === 'Y' && segment.matched)).toBe(true);
    });

    it('validates IANA timezone names', () => {
        expect(isValidTimezone('Asia/Tokyo')).toBe(true);
        expect(isValidTimezone('Not/A_Real_Zone')).toBe(false);
    });

    it('returns the system local timezone when available', () => {
        const timezone = getLocalTimezone();

        expect(timezone === null || timezone.length > 0).toBe(true);
    });
});
