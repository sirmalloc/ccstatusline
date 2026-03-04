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

export function filterWidgetCatalog(catalog: WidgetCatalogEntry[], category: string, query: string): WidgetCatalogEntry[] {
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

            if (name.startsWith(normalizedQuery)) {
                return { entry, score: 0 };
            }
            if (name.includes(normalizedQuery)) {
                return { entry, score: 1 };
            }
            if (type.includes(normalizedQuery)) {
                return { entry, score: 2 };
            }
            if (description.includes(normalizedQuery)) {
                return { entry, score: 3 };
            }
            if (entry.searchText.includes(normalizedQuery)) {
                return { entry, score: 4 };
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

export function isKnownWidgetType(type: string): boolean {
    return widgetRegistry.has(type)
        || layoutWidgetTypes.has(type);
}