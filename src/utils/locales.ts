import {
    filterFuzzySearchRecords,
    getMatchSegments,
    type FuzzySearchRecord,
    type MatchSegment
} from './fuzzy';

export const DEFAULT_RESET_LOCALE = 'en-US';

export interface LocaleOption {
    value: string;
    displayName: string;
    description: string;
    searchText: string;
    sortText: string;
}

interface CommonLocale {
    value: string;
    description: string;
    searchText: string;
}

const COMMON_LOCALES: CommonLocale[] = [
    { value: 'en-US', description: 'English (United States)', searchText: 'english united states usa us america' },
    { value: 'en-CA', description: 'English (Canada)', searchText: 'english canada canadian ca' },
    { value: 'en-GB', description: 'English (United Kingdom)', searchText: 'english united kingdom great britain uk gb' },
    { value: 'fr-FR', description: 'French (France)', searchText: 'french france francais' },
    { value: 'fr-CA', description: 'French (Canada)', searchText: 'french canada canadian quebec francais' },
    { value: 'de-DE', description: 'German (Germany)', searchText: 'german germany deutsch deutschland' },
    { value: 'es-ES', description: 'Spanish (Spain)', searchText: 'spanish spain espanol espana' },
    { value: 'es-MX', description: 'Spanish (Mexico)', searchText: 'spanish mexico mexican espanol' },
    { value: 'ja-JP', description: 'Japanese (Japan)', searchText: 'japanese japan nihongo' },
    { value: 'ko-KR', description: 'Korean (South Korea)', searchText: 'korean korea hangul' },
    { value: 'zh-CN', description: 'Chinese (China, Simplified)', searchText: 'chinese china simplified mandarin' },
    { value: 'zh-TW', description: 'Chinese (Taiwan, Traditional)', searchText: 'chinese taiwan traditional mandarin' },
    { value: 'pt-BR', description: 'Portuguese (Brazil)', searchText: 'portuguese brazil brasil portugues' },
    { value: 'it-IT', description: 'Italian (Italy)', searchText: 'italian italy italiano' },
    { value: 'nl-NL', description: 'Dutch (Netherlands)', searchText: 'dutch netherlands nederland nederlands' },
    { value: 'sv-SE', description: 'Swedish (Sweden)', searchText: 'swedish sweden svenska' },
    { value: 'pl-PL', description: 'Polish (Poland)', searchText: 'polish poland polski' },
    { value: 'ru-RU', description: 'Russian (Russia)', searchText: 'russian russia russkiy' },
    { value: 'hi-IN', description: 'Hindi (India)', searchText: 'hindi india devanagari' },
    { value: 'ar-SA', description: 'Arabic (Saudi Arabia)', searchText: 'arabic saudi arabia' }
];

const DEFAULT_LOCALE_OPTION: LocaleOption = {
    value: DEFAULT_RESET_LOCALE,
    displayName: DEFAULT_RESET_LOCALE,
    description: 'Default reset timestamp locale',
    searchText: 'default english united states usa us america reset timestamp',
    sortText: `0000 ${DEFAULT_RESET_LOCALE}`
};

export function canonicalizeLocale(locale: string): string | null {
    const trimmed = locale.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const canonical = Intl.getCanonicalLocales(trimmed)[0];
        if (!canonical || Intl.DateTimeFormat.supportedLocalesOf([canonical]).length === 0) {
            return null;
        }

        return canonical;
    } catch {
        return null;
    }
}

export function getSystemLocale(): string | null {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof locale === 'string' ? canonicalizeLocale(locale) : null;
}

export function isValidLocale(locale: string): boolean {
    return canonicalizeLocale(locale) !== null;
}

function createSystemLocaleOption(systemLocale: string): LocaleOption {
    return {
        value: systemLocale,
        displayName: `System (${systemLocale})`,
        description: 'Current system locale',
        searchText: `system current local machine runtime ${systemLocale}`,
        sortText: `0001 ${systemLocale}`
    };
}

function createCommonLocaleOption(locale: CommonLocale, sortIndex: number): LocaleOption {
    return {
        value: locale.value,
        displayName: locale.value,
        description: locale.description,
        searchText: locale.searchText,
        sortText: `${(sortIndex + 2).toString().padStart(4, '0')} ${locale.value}`
    };
}

function createConfiguredLocaleOption(locale: string): LocaleOption {
    return {
        value: locale,
        displayName: locale,
        description: 'Configured locale',
        searchText: `configured current ${locale}`,
        sortText: `0002 ${locale}`
    };
}

function createCustomLocaleOption(locale: string): LocaleOption {
    return {
        value: locale,
        displayName: `Use ${locale}`,
        description: 'Custom locale',
        searchText: `custom typed ${locale}`,
        sortText: `0000 ${locale}`
    };
}

function appendUniqueLocale(options: LocaleOption[], option: LocaleOption): void {
    if (!options.some(existing => existing.value === option.value)) {
        options.push(option);
    }
}

export function getLocaleOptions(currentLocale?: string): LocaleOption[] {
    const options = [DEFAULT_LOCALE_OPTION];
    const systemLocale = getSystemLocale();

    if (systemLocale && systemLocale !== DEFAULT_RESET_LOCALE) {
        appendUniqueLocale(options, createSystemLocaleOption(systemLocale));
    }

    const configuredLocale = currentLocale ? canonicalizeLocale(currentLocale) : null;
    if (configuredLocale && configuredLocale !== DEFAULT_RESET_LOCALE && configuredLocale !== systemLocale) {
        appendUniqueLocale(options, createConfiguredLocaleOption(configuredLocale));
    }

    COMMON_LOCALES
        .map(createCommonLocaleOption)
        .forEach((option) => {
            appendUniqueLocale(options, option);
        });

    return options;
}

export function filterLocaleOptions(options: LocaleOption[], query: string): LocaleOption[] {
    const records: FuzzySearchRecord<LocaleOption>[] = options.map(option => ({
        item: option,
        name: option.displayName,
        type: option.value,
        description: option.description,
        searchText: `${option.displayName} ${option.description} ${option.value} ${option.searchText}`,
        sortText: option.sortText,
        secondarySortText: option.value
    }));
    const matches = filterFuzzySearchRecords(records, query);
    const canonicalQuery = canonicalizeLocale(query);

    if (!canonicalQuery || options.some(option => option.value === canonicalQuery)) {
        return matches;
    }

    return [
        createCustomLocaleOption(canonicalQuery),
        ...matches
    ];
}

export function getLocaleMatchSegments(text: string, query: string): MatchSegment[] {
    return getMatchSegments(text, query);
}
