import {
    filterFuzzySearchRecords,
    getMatchSegments,
    type FuzzySearchRecord,
    type MatchSegment
} from './fuzzy';

export interface TimezoneOption {
    value: string;
    displayName: string;
    description: string;
    searchText: string;
    sortText: string;
}

const UTC_TIMEZONE: TimezoneOption = {
    value: 'UTC',
    displayName: 'UTC',
    description: 'Default UTC reset timestamp',
    searchText: 'utc default coordinated universal time z',
    sortText: '0000 UTC'
};

function getSupportedTimezoneValues(): string[] {
    const supportedValuesOf = Intl.supportedValuesOf as ((key: 'timeZone') => string[]) | undefined;

    if (typeof supportedValuesOf !== 'function') {
        return [];
    }

    try {
        return supportedValuesOf('timeZone');
    } catch {
        return [];
    }
}

export function getLocalTimezone(): string | null {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === 'string' && timezone.length > 0 ? timezone : null;
}

export function isValidTimezone(timezone: string): boolean {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: timezone });
        return true;
    } catch {
        return false;
    }
}

function createLocalTimezoneOption(): TimezoneOption {
    const localTimezone = getLocalTimezone();
    const suffix = localTimezone ? ` (${localTimezone})` : '';
    const searchText = [
        'local',
        'system',
        'machine',
        'browser',
        localTimezone ?? ''
    ].join(' ');

    return {
        value: 'local',
        displayName: `Local${suffix}`,
        description: 'Use this system timezone',
        searchText,
        sortText: `0001 Local${suffix}`
    };
}

function createIanaTimezoneOption(timezone: string, sortIndex: number): TimezoneOption {
    return {
        value: timezone,
        displayName: timezone,
        description: 'IANA timezone',
        searchText: timezone.replace(/[/_-]/g, ' '),
        sortText: `${(sortIndex + 2).toString().padStart(4, '0')} ${timezone}`
    };
}

export function getTimezoneOptions(currentTimezone?: string): TimezoneOption[] {
    const supportedTimezones = getSupportedTimezoneValues()
        .filter(timezone => timezone !== 'UTC');
    const options = [
        UTC_TIMEZONE,
        createLocalTimezoneOption(),
        ...supportedTimezones.map(createIanaTimezoneOption)
    ];
    const hasCurrentTimezone = currentTimezone
        && currentTimezone !== 'UTC'
        && currentTimezone !== 'local'
        && options.some(option => option.value === currentTimezone);

    if (!currentTimezone || hasCurrentTimezone || currentTimezone === 'UTC' || currentTimezone === 'local' || !isValidTimezone(currentTimezone)) {
        return options;
    }

    return [
        ...options.slice(0, 2),
        {
            ...createIanaTimezoneOption(currentTimezone, 0),
            description: 'Configured timezone'
        },
        ...options.slice(2)
    ];
}

export function filterTimezoneOptions(options: TimezoneOption[], query: string): TimezoneOption[] {
    const records: FuzzySearchRecord<TimezoneOption>[] = options.map(option => ({
        item: option,
        name: option.displayName,
        type: option.value,
        description: option.description,
        searchText: `${option.displayName} ${option.description} ${option.value} ${option.searchText}`,
        sortText: option.sortText,
        secondarySortText: option.value
    }));

    return filterFuzzySearchRecords(records, query);
}

export function getTimezoneMatchSegments(text: string, query: string): MatchSegment[] {
    return getMatchSegments(text, query);
}
