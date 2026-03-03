import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItem,
    WidgetItemType
} from '../types/Widget';

import {
    filterFuzzySearchRecords,
    type FuzzySearchRecord
} from './fuzzy';
import {
    LAYOUT_WIDGET_MANIFEST,
    WIDGET_MANIFEST
} from './widget-manifest';

export { getMatchSegments } from './fuzzy';

// Create widget registry
const widgetRegistry = new Map<WidgetItemType, Widget>(
    WIDGET_MANIFEST.map((entry): [WidgetItemType, Widget] => [entry.type, entry.create()])
);
const layoutWidgetTypes = new Set<WidgetItemType>(LAYOUT_WIDGET_MANIFEST.map(entry => entry.type));

export const LEGACY_WIDGET_TYPE_ALIASES: Record<string, WidgetItemType> = { 'git-pr': 'git-review' };

export function resolveLegacyWidgetType(type: WidgetItemType): WidgetItemType {
    return LEGACY_WIDGET_TYPE_ALIASES[type] ?? type;
}

export function upgradeLegacyWidgetTypes(lines: WidgetItem[][]): WidgetItem[][] {
    return lines.map(line => line.map((item) => {
        const resolved = resolveLegacyWidgetType(item.type);
        return resolved === item.type ? item : { ...item, type: resolved };
    }));
}

export function getWidget(type: WidgetItemType): Widget | null {
    return widgetRegistry.get(resolveLegacyWidgetType(type)) ?? null;
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

const WIDGET_SORT_PRIORITY: Partial<Record<WidgetItemType, number>> = { activity: 0 };

function getWidgetSortPriority(entry: WidgetCatalogEntry): number {
    // Only apply explicit ordering within the Activity category.
    if (entry.category !== 'Activity') {
        return Number.MAX_SAFE_INTEGER;
    }

    return WIDGET_SORT_PRIORITY[entry.type] ?? Number.MAX_SAFE_INTEGER;
}

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

export function filterWidgetCatalog(catalog: WidgetCatalogEntry[], category: string, query: string): WidgetCatalogEntry[] {
    const categoryFiltered = category === 'All'
        ? [...catalog]
        : catalog.filter(entry => entry.category === category);
    const shouldPrioritizeActivity = category === 'Activity';

    const records: FuzzySearchRecord<WidgetCatalogEntry>[] = categoryFiltered.map(entry => ({
        item: entry,
        name: entry.displayName,
        type: entry.type,
        description: entry.description,
        searchText: entry.searchText,
        sortText: shouldPrioritizeActivity
            ? `${String(getWidgetSortPriority(entry)).padStart(16, '0')} ${entry.displayName}`
            : entry.displayName,
        secondarySortText: entry.type
    }));

    return filterFuzzySearchRecords(records, query);
}

export function isKnownWidgetType(type: string): boolean {
    const resolved = resolveLegacyWidgetType(type);
    return widgetRegistry.has(resolved)
        || layoutWidgetTypes.has(resolved);
}
