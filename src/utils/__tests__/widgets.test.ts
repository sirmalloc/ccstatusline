import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItemType } from '../../types/Widget';
import {
    filterWidgetCatalog,
    getWidgetCatalog,
    getWidgetCatalogCategories,
    type WidgetCatalogEntry
} from '../widgets';

describe('widget catalog', () => {
    const baseSettings: Settings = {
        ...DEFAULT_SETTINGS,
        powerline: { ...DEFAULT_SETTINGS.powerline }
    };

    it('builds catalog entries with categories from widget definitions', () => {
        const catalog = getWidgetCatalog(baseSettings);

        const model = catalog.find(entry => entry.type === 'model');
        const separator = catalog.find(entry => entry.type === 'separator');

        expect(model?.displayName).toBe('Model');
        expect(model?.category).toBe('Core');
        expect(separator?.displayName).toBe('Separator');
        expect(separator?.category).toBe('Layout');
    });

    it('hides manual separator when default separator is configured', () => {
        const catalog = getWidgetCatalog({
            ...baseSettings,
            defaultSeparator: '|'
        });

        const types = new Set(catalog.map(entry => entry.type));
        expect(types.has('separator')).toBe(false);
        expect(types.has('flex-separator')).toBe(true);
    });

    it('hides both separator types in powerline mode', () => {
        const catalog = getWidgetCatalog({
            ...baseSettings,
            powerline: {
                ...baseSettings.powerline,
                enabled: true
            }
        });

        const types = new Set(catalog.map(entry => entry.type));
        expect(types.has('separator')).toBe(false);
        expect(types.has('flex-separator')).toBe(false);
    });

    it('returns unique categories in discovery order', () => {
        const categories = getWidgetCatalogCategories(getWidgetCatalog(baseSettings));

        expect(categories).toContain('Core');
        expect(categories).toContain('Git');
        expect(categories).toContain('Context');
        expect(categories).toContain('Tokens');
        expect(categories).toContain('Session');
        expect(categories).toContain('Environment');
        expect(categories).toContain('Custom');
        expect(categories).toContain('Layout');
    });
});

describe('widget catalog filtering', () => {
    const catalog = getWidgetCatalog({
        ...DEFAULT_SETTINGS,
        powerline: { ...DEFAULT_SETTINGS.powerline }
    });

    it('matches display name with case-insensitive partial search', () => {
        const results = filterWidgetCatalog(catalog, 'All', 'gIt br');
        expect(results[0]?.type).toBe('git-branch');
    });

    it('matches type string search such as git-worktree', () => {
        const results = filterWidgetCatalog(catalog, 'All', 'git-worktree');
        expect(results[0]?.type).toBe('git-worktree');
    });

    it('matches description search', () => {
        const results = filterWidgetCatalog(catalog, 'All', 'working directory');
        expect(results.some(entry => entry.type === 'current-working-dir')).toBe(true);
    });

    it('applies category and query filters together', () => {
        const results = filterWidgetCatalog(catalog, 'Git', 'context');
        expect(results).toHaveLength(0);
    });

    it('prioritizes name match before type and description matches', () => {
        const rankingCatalog: WidgetCatalogEntry[] = [
            {
                type: 'alpha' as WidgetItemType,
                displayName: 'Git Branch',
                description: 'Primary match',
                category: 'Core',
                searchText: 'git branch primary match alpha'
            },
            {
                type: 'git-type-only' as WidgetItemType,
                displayName: 'Branch',
                description: 'Type fallback match',
                category: 'Core',
                searchText: 'branch type fallback match git-type-only'
            },
            {
                type: 'desc-only' as WidgetItemType,
                displayName: 'Branch',
                description: 'Description contains git',
                category: 'Core',
                searchText: 'branch description contains git desc-only'
            }
        ];

        const results = filterWidgetCatalog(rankingCatalog, 'All', 'git');
        expect(results.map(entry => entry.type)).toEqual(['alpha', 'git-type-only', 'desc-only']);
    });
});