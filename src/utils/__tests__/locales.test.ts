import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_RESET_LOCALE,
    canonicalizeLocale,
    filterLocaleOptions,
    getLocaleMatchSegments,
    getLocaleOptions,
    getSystemLocale,
    isValidLocale
} from '../locales';

// Node takes the runtime's locale from LANG and Bun keeps en-US, so a test
// that depends on the System row pins it
function stubSystemLocale(locale: string): void {
    const resolved = new Intl.DateTimeFormat(locale).resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue(resolved);
}

describe('locale helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('includes the default locale first and curated common locales', () => {
        const options = getLocaleOptions();

        expect(options[0]?.value).toBe(DEFAULT_RESET_LOCALE);
        expect(options.some(option => option.value === 'ja-JP')).toBe(true);
        expect(options.some(option => option.value === 'en-US')).toBe(true);
        expect(options.some(option => option.value === 'en-CA')).toBe(true);
    });

    it('includes the system locale when it differs from the default', () => {
        const systemLocale = getSystemLocale();
        const options = getLocaleOptions();

        expect(systemLocale === null || options.some(option => option.value === systemLocale)).toBe(true);
    });

    it('includes the configured locale when it is valid and uncommon', () => {
        const configuredLocale = canonicalizeLocale('en-AU');
        if (!configuredLocale) {
            return;
        }

        const options = getLocaleOptions(configuredLocale);

        expect(options.some(option => option.value === configuredLocale && option.description === 'Configured locale')).toBe(true);
    });

    it('filters locale options with fuzzy matching', () => {
        const matches = filterLocaleOptions(getLocaleOptions(), 'japan');

        expect(matches[0]?.value).toBe('ja-JP');
    });

    it('adds a custom locale option for valid typed locales outside the curated list', () => {
        const customLocale = canonicalizeLocale('en-AU');
        if (!customLocale) {
            return;
        }

        const matches = filterLocaleOptions(getLocaleOptions(), 'en-au');

        expect(matches[0]).toMatchObject({
            value: customLocale,
            displayName: `Use ${customLocale}`,
            description: 'Custom locale'
        });
    });

    it('ranks a locale whose keyword is the search above the custom locale it spells', () => {
        stubSystemLocale(DEFAULT_RESET_LOCALE);

        // 'uk' and 'ca' are keywords of en-GB and en-CA, and also the language
        // codes of Ukrainian and Catalan
        const ukMatches = filterLocaleOptions(getLocaleOptions(), 'uk');
        expect(ukMatches[0]?.value).toBe('en-GB');
        expect(ukMatches[1]).toMatchObject({ value: 'uk', description: 'Custom locale' });

        const caMatches = filterLocaleOptions(getLocaleOptions(), 'ca');
        expect(caMatches[0]?.value).toBe('en-CA');
        expect(caMatches[1]).toMatchObject({ value: 'ca', description: 'Custom locale' });
    });

    // The System and Configured rows take the place of the common row for
    // their locale, so they have to keep its keywords
    it.each([
        ['en-GB', 'uk'],
        ['en-CA', 'ca']
    ] as const)('ranks %s above the custom locale %s when it is the system locale', (locale, keyword) => {
        stubSystemLocale(locale);

        const matches = filterLocaleOptions(getLocaleOptions(), keyword);
        expect(matches[0]).toMatchObject({ value: locale, displayName: `System (${locale})` });
        expect(matches[1]).toMatchObject({ value: keyword, description: 'Custom locale' });
    });

    it.each([
        ['en-GB', 'uk'],
        ['en-CA', 'ca']
    ] as const)('ranks %s above the custom locale %s when it is the configured locale', (locale, keyword) => {
        stubSystemLocale(DEFAULT_RESET_LOCALE);

        const matches = filterLocaleOptions(getLocaleOptions(locale), keyword);
        expect(matches[0]).toMatchObject({ value: locale, description: 'Configured locale' });
        expect(matches[1]).toMatchObject({ value: keyword, description: 'Custom locale' });
    });

    it('does not add a custom locale option for invalid typed locales', () => {
        const matches = filterLocaleOptions(getLocaleOptions(), 'not-a-locale');

        expect(matches.some(option => option.description === 'Custom locale')).toBe(false);
    });

    it('highlights locale match segments', () => {
        const segments = getLocaleMatchSegments('ja-JP', 'ja');

        expect(segments.some(segment => segment.text === 'ja' && segment.matched)).toBe(true);
    });

    it('canonicalizes and validates BCP 47 locale tags', () => {
        expect(canonicalizeLocale('ja-jp')).toBe('ja-JP');
        expect(isValidLocale('fr-ca')).toBe(true);
        expect(isValidLocale('not-a-locale')).toBe(false);
    });
});
