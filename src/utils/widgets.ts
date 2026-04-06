import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItemType
} from '../types/Widget';
import * as widgets from '../widgets';

// Create widget registry
const widgetRegistry = new Map<WidgetItemType, Widget>([
    ['model', new widgets.ModelWidget()],
    ['output-style', new widgets.OutputStyleWidget()],
    ['git-branch', new widgets.GitBranchWidget()],
    ['git-changes', new widgets.GitChangesWidget()],
    ['git-insertions', new widgets.GitInsertionsWidget()],
    ['git-deletions', new widgets.GitDeletionsWidget()],
    ['git-root-dir', new widgets.GitRootDirWidget()],
    ['git-worktree', new widgets.GitWorktreeWidget()],
    ['current-working-dir', new widgets.CurrentWorkingDirWidget()],
    ['tokens-input', new widgets.TokensInputWidget()],
    ['tokens-output', new widgets.TokensOutputWidget()],
    ['tokens-cached', new widgets.TokensCachedWidget()],
    ['tokens-total', new widgets.TokensTotalWidget()],
    ['context-length', new widgets.ContextLengthWidget()],
    ['context-percentage', new widgets.ContextPercentageWidget()],
    ['context-percentage-usable', new widgets.ContextPercentageUsableWidget()],
    ['session-clock', new widgets.SessionClockWidget()],
    ['session-cost', new widgets.SessionCostWidget()],
    ['tools-activity', new widgets.ToolsActivityWidget()],
    ['agents-activity', new widgets.AgentsActivityWidget()],
    ['todo-progress', new widgets.TodoProgressWidget()],
    ['activity', new widgets.ActivityWidget()],
    ['block-timer', new widgets.BlockTimerWidget()],
    ['terminal-width', new widgets.TerminalWidthWidget()],
    ['version', new widgets.VersionWidget()],
    ['custom-text', new widgets.CustomTextWidget()],
    ['custom-command', new widgets.CustomCommandWidget()],
    ['link', new widgets.LinkWidget()],
    ['claude-session-id', new widgets.ClaudeSessionIdWidget()],
    ['session-name', new widgets.SessionNameWidget()],
    ['free-memory', new widgets.FreeMemoryWidget()],
    ['session-usage', new widgets.SessionUsageWidget()],
    ['weekly-usage', new widgets.WeeklyUsageWidget()],
    ['reset-timer', new widgets.ResetTimerWidget()],
    ['context-bar', new widgets.ContextBarWidget()],
    ['environment', new widgets.EnvironmentWidget()]
]);

export function getWidget(type: WidgetItemType): Widget | null {
    return widgetRegistry.get(type) ?? null;
}

export function getAllWidgetTypes(settings: Settings): WidgetItemType[] {
    const allTypes = Array.from(widgetRegistry.keys());

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

const LAYOUT_WIDGETS: Record<string, Omit<WidgetCatalogEntry, 'type' | 'searchText'>> = {
    'separator': {
        displayName: 'Separator',
        description: 'A separator character between status line widgets',
        category: 'Layout'
    },
    'flex-separator': {
        displayName: 'Flex Separator',
        description: 'Expands to fill available terminal width',
        category: 'Layout'
    }
};

const WIDGET_SORT_PRIORITY: Partial<Record<WidgetItemType, number>> = { activity: 0 };

function getWidgetSortPriority(entry: WidgetCatalogEntry): number {
    // Only apply explicit ordering within the Activity category.
    if (entry.category !== 'Activity') {
        return Number.MAX_SAFE_INTEGER;
    }

    return WIDGET_SORT_PRIORITY[entry.type] ?? Number.MAX_SAFE_INTEGER;
}

function getLayoutCatalogEntry(type: WidgetItemType): WidgetCatalogEntry | null {
    const layout = LAYOUT_WIDGETS[type];
    if (!layout) {
        return null;
    }

    return {
        type,
        displayName: layout.displayName,
        description: layout.description,
        category: layout.category,
        searchText: `${layout.displayName} ${layout.description} ${type}`.toLowerCase()
    };
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

            if (a.entry.category === b.entry.category) {
                const byPriority = getWidgetSortPriority(a.entry) - getWidgetSortPriority(b.entry);
                if (byPriority !== 0) {
                    return byPriority;
                }
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
        || type === 'separator'
        || type === 'flex-separator';
}