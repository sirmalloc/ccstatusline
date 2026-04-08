import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItemType
} from '../types/Widget';

import {
    LAYOUT_WIDGET_MANIFEST,
    WIDGET_MANIFEST
} from './widget-manifest';

// Create widget registry
const widgetRegistry = new Map<WidgetItemType, Widget>(
    WIDGET_MANIFEST.map((entry): [WidgetItemType, Widget] => [entry.type, entry.create()])
);
const layoutWidgetTypes = new Set<WidgetItemType>(LAYOUT_WIDGET_MANIFEST.map(entry => entry.type));

export function getWidget(type: WidgetItemType): Widget | null {
    return widgetRegistry.get(type) ?? null;
}

export function getAllWidgetTypes(settings: Settings): WidgetItemType[] {
    const allTypes = WIDGET_MANIFEST.map(entry => entry.type);

    // Add separator types based on settings
    if (!settings.powerline.enabled) {
        if (!settings.defaultSeparator) {
            allTypes.push('separator');
        }
        allTypes.push('flex-separator');
    }

    return allTypes;
}

export interface WidgetCatalogEntry {
    type: WidgetItemType;
    displayName: string;
    description: string;
    category: string;
    searchText: string;
}

const layoutCatalogEntries = new Map<WidgetItemType, WidgetCatalogEntry>(
    LAYOUT_WIDGET_MANIFEST.map((entry): [WidgetItemType, WidgetCatalogEntry] => [
        entry.type,
        {
            type: entry.type,
            displayName: entry.displayName,
            description: entry.description,
            category: entry.category,
            searchText: `${entry.displayName} ${entry.description} ${entry.type}`.toLowerCase()
        }
    ])
);

function getLayoutCatalogEntry(type: WidgetItemType): WidgetCatalogEntry | null {
    return layoutCatalogEntries.get(type) ?? null;
}

export function getWidgetCatalog(settings: Settings): WidgetCatalogEntry[] {
    return getAllWidgetTypes(settings).map((type) => {
        const layoutEntry = getLayoutCatalogEntry(type);
        if (layoutEntry) {
            return layoutEntry;
        }

        const widget = getWidget(type);
        const displayName = widget?.getDisplayName() ?? type;
        const description = widget?.getDescription() ?? `Unknown widget: ${type}`;
        const category = widget?.getCategory() ?? 'Other';

        return {
            type,
            displayName,
            description,
            category,
            searchText: `${displayName} ${description} ${type}`.toLowerCase()
        };
    });
}

export function getWidgetCatalogCategories(catalog: WidgetCatalogEntry[]): string[] {
    const categories = new Set<string>();

    for (const entry of catalog) {
        categories.add(entry.category);
    }

    return Array.from(categories);
}

function isWordStart(text: string, position: number): boolean {
    return position === 0
        || text[position - 1] === ' '
        || text[position - 1] === '-'
        || text[position - 1] === '_';
}

function findSubsequencePositions(text: string, query: string): number[] | null {
    let qi = 0;
    const positions: number[] = [];

    for (let ti = 0; ti < text.length && qi < query.length; ti++) {
        if (text[ti] === query[qi]) {
            positions.push(ti);
            qi++;
        }
    }

    return qi < query.length ? null : positions;
}

function findInitialismMatch(text: string, query: string): { positions: number[]; score: number } | null {
    const wordStartPositions: number[] = [];

    for (let i = 0; i < text.length; i++) {
        if (isWordStart(text, i)) {
            wordStartPositions.push(i);
        }
    }

    const initials = wordStartPositions.map(position => text[position]).join('');
    const matchedInitials = findSubsequencePositions(initials, query);

    if (matchedInitials === null) {
        return null;
    }

    const first = matchedInitials[0];
    const last = matchedInitials[matchedInitials.length - 1];

    if (first === undefined || last === undefined) {
        return null;
    }

    const positions: number[] = [];

    for (const initialIndex of matchedInitials) {
        const position = wordStartPositions[initialIndex];
        if (position === undefined) {
            return null;
        }
        positions.push(position);
    }

    return {
        positions,
        score: (last - first) + first
    };
}

function computeFuzzyScore(text: string, query: string): number | null {
    const CONSECUTIVE_BONUS_RATE = 5;
    const WORD_START_BONUS_RATE = 20;
    const FULL_INITIALISM_BONUS = 40;
    const positions = findSubsequencePositions(text, query);

    if (positions === null) {
        return null;
    }

    const first = positions[0];
    const last = positions[positions.length - 1];

    if (first === undefined || last === undefined) {
        return null;
    }

    const span = last - first;
    let consecutiveBonus = 0;
    let wordStartMatches = 0;

    let previousPosition: number | null = null;

    positions.forEach((position) => {
        if (previousPosition !== null && position === previousPosition + 1) {
            consecutiveBonus += CONSECUTIVE_BONUS_RATE;
        }
        if (isWordStart(text, position)) {
            wordStartMatches++;
        }
        previousPosition = position;
    });

    const fullInitialismBonus = wordStartMatches === query.length
        ? FULL_INITIALISM_BONUS
        : 0;

    return span
        + first
        - consecutiveBonus
        - (wordStartMatches * WORD_START_BONUS_RATE)
        - fullInitialismBonus;
}

export function filterWidgetCatalog(catalog: WidgetCatalogEntry[], category: string, query: string): WidgetCatalogEntry[] {
    const MATCH_PRIORITY = {
        NAME_PREFIX_WITH_INITIALISM: 0,
        NAME_PREFIX: 1,
        NAME_INITIALISM: 2,
        NAME_SUBSTRING: 3,
        TYPE_SUBSTRING: 4,
        NAME_FUZZY: 5,
        DESCRIPTION_SUBSTRING: 6,
        SEARCH_SUBSTRING: 7,
        TYPE_FUZZY: 8,
        SEARCH_FUZZY: 9
    };

    const MATCH_TIER_SIZE = 1000;

    const normalizedQuery = query.trim().toLowerCase();

    const categoryFiltered = category === 'All'
        ? [...catalog]
        : catalog.filter(entry => entry.category === category);

    const withScore = categoryFiltered
        .map((entry) => {
            if (!normalizedQuery) {
                return {
                    entry,
                    score: 99
                };
            }

            const name = entry.displayName.toLowerCase();
            const description = entry.description.toLowerCase();
            const type = entry.type.toLowerCase();
            const nameInitialism = findInitialismMatch(name, normalizedQuery);

            if (name.startsWith(normalizedQuery) && nameInitialism !== null) {
                return { entry, score: MATCH_PRIORITY.NAME_PREFIX_WITH_INITIALISM * MATCH_TIER_SIZE + nameInitialism.score };
            }
            if (name.startsWith(normalizedQuery)) {
                return { entry, score: MATCH_PRIORITY.NAME_PREFIX * MATCH_TIER_SIZE };
            }
            if (nameInitialism !== null) {
                return { entry, score: MATCH_PRIORITY.NAME_INITIALISM * MATCH_TIER_SIZE + nameInitialism.score };
            }
            if (name.includes(normalizedQuery)) {
                return { entry, score: MATCH_PRIORITY.NAME_SUBSTRING * MATCH_TIER_SIZE };
            }
            if (type.includes(normalizedQuery)) {
                return { entry, score: MATCH_PRIORITY.TYPE_SUBSTRING * MATCH_TIER_SIZE };
            }

            const nameFuzzy = computeFuzzyScore(name, normalizedQuery);
            if (nameFuzzy !== null) {
                return { entry, score: MATCH_PRIORITY.NAME_FUZZY * MATCH_TIER_SIZE + nameFuzzy };
            }
            if (description.includes(normalizedQuery)) {
                return { entry, score: MATCH_PRIORITY.DESCRIPTION_SUBSTRING * MATCH_TIER_SIZE };
            }
            if (entry.searchText.includes(normalizedQuery)) {
                return { entry, score: MATCH_PRIORITY.SEARCH_SUBSTRING * MATCH_TIER_SIZE };
            }
            const typeFuzzy = computeFuzzyScore(type, normalizedQuery);
            if (typeFuzzy !== null) {
                return { entry, score: MATCH_PRIORITY.TYPE_FUZZY * MATCH_TIER_SIZE + typeFuzzy };
            }
            const searchFuzzy = computeFuzzyScore(entry.searchText, normalizedQuery);
            if (searchFuzzy !== null) {
                return { entry, score: MATCH_PRIORITY.SEARCH_FUZZY * MATCH_TIER_SIZE + searchFuzzy };
            }

            return null;
        })
        .filter((item): item is { entry: WidgetCatalogEntry; score: number } => item !== null);

    return withScore
        .sort((a, b) => {
            if (a.score !== b.score) {
                return a.score - b.score;
            }

            const byDisplayName = a.entry.displayName.localeCompare(b.entry.displayName);
            if (byDisplayName !== 0) {
                return byDisplayName;
            }

            return a.entry.type.localeCompare(b.entry.type);
        })
        .map(item => item.entry);
}

export function getMatchSegments(text: string, query: string): { text: string; matched: boolean }[] {
    if (!query.trim()) {
        return [{ text, matched: false }];
    }

    const normalizedQuery = query.trim().toLowerCase();
    const normalizedText = text.toLowerCase();

    const initialismPositions = findInitialismMatch(normalizedText, normalizedQuery)?.positions;
    if (initialismPositions !== undefined) {
        const posSet = new Set(initialismPositions);
        const segments: { text: string; matched: boolean }[] = [];
        let current = '';
        let currentMatched = posSet.has(0);

        for (let i = 0; i < text.length; i++) {
            const isMatched = posSet.has(i);
            if (isMatched !== currentMatched && current) {
                segments.push({ text: current, matched: currentMatched });
                current = text[i] ?? '';
                currentMatched = isMatched;
            } else {
                current += text[i] ?? '';
            }
        }

        if (current) {
            segments.push({ text: current, matched: currentMatched });
        }

        return segments;
    }

    const substringIdx = normalizedText.indexOf(normalizedQuery);
    if (substringIdx !== -1) {
        const end = substringIdx + normalizedQuery.length;
        const segments: { text: string; matched: boolean }[] = [];
        if (substringIdx > 0) {
            segments.push({ text: text.slice(0, substringIdx), matched: false });
        }
        segments.push({ text: text.slice(substringIdx, end), matched: true });
        if (end < text.length) {
            segments.push({ text: text.slice(end), matched: false });
        }
        return segments;
    }

    const positions = findSubsequencePositions(normalizedText, normalizedQuery);
    if (positions === null) {
        return [{ text, matched: false }];
    }

    const posSet = new Set(positions);
    const segments: { text: string; matched: boolean }[] = [];
    let current = '';
    let currentMatched = posSet.has(0);

    for (let i = 0; i < text.length; i++) {
        const isMatched = posSet.has(i);
        if (isMatched !== currentMatched && current) {
            segments.push({ text: current, matched: currentMatched });
            current = text[i] ?? '';
            currentMatched = isMatched;
        } else {
            current += text[i] ?? '';
        }
    }

    if (current) {
        segments.push({ text: current, matched: currentMatched });
    }

    return segments;
}

export function isKnownWidgetType(type: string): boolean {
    return widgetRegistry.has(type)
        || layoutWidgetTypes.has(type);
}