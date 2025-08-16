import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { generateGuid } from './guid';

// Type for migration functions
interface Migration {
    fromVersion: number;
    toVersion: number;
    description: string;
    migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

// Type guards for checking data structure
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Define all migrations here
export const migrations: Migration[] = [
    {
        fromVersion: 1,
        toVersion: 2,
        description: 'Migrate from v1 to v2',
        migrate: (data) => {
            // Start with a partial Settings type for type safety
            const migrated: Partial<Settings> & Record<string, unknown> = { ...data };

            // Migrate old powerline format to new format
            const powerline = isRecord(data.powerline) ? data.powerline : null;
            if (powerline) {
                // Convert old single separator/cap format to arrays
                const oldSeparator = typeof powerline.separator === 'string' ? powerline.separator : '';
                const oldStartCap = typeof powerline.startCap === 'string' ? powerline.startCap : '';
                const oldEndCap = typeof powerline.endCap === 'string' ? powerline.endCap : '';

                migrated.powerline = {
                    enabled: Boolean(powerline.enabled ?? false),
                    separators: oldSeparator !== '' ? [oldSeparator] : ['\uE0B0'],
                    separatorInvertBackground: [false],
                    startCaps: oldStartCap !== '' ? [oldStartCap] : [],
                    endCaps: oldEndCap !== '' ? [oldEndCap] : [],
                    theme: typeof powerline.theme === 'string' ? powerline.theme : 'custom'
                };
            } else {
                // If no powerline config exists, create default disabled one
                migrated.powerline = {
                    enabled: false,
                    separators: ['\uE0B0'],
                    separatorInvertBackground: [false],
                    startCaps: [],
                    endCaps: [],
                    theme: 'custom'
                };
            }

            // Process lines: strip separators if needed and assign GUIDs
            if (data.lines && Array.isArray(data.lines)) {
                const processedLines: WidgetItem[][] = [];

                for (const line of data.lines) {
                    if (Array.isArray(line)) {
                        // Filter out separators if defaultSeparator is enabled
                        let processedLine = line;
                        if (data.defaultSeparator) {
                            processedLine = line.filter((item: unknown) => {
                                if (isRecord(item)) {
                                    return item.type !== 'separator';
                                }
                                return true;
                            });
                        }

                        // Assign GUIDs to all items and build typed array
                        const typedLine: WidgetItem[] = [];
                        for (const item of processedLine) {
                            if (isRecord(item) && typeof item.type === 'string') {
                                typedLine.push({
                                    ...item,
                                    id: generateGuid(),
                                    type: item.type
                                } as WidgetItem);
                            }
                        }
                        processedLines.push(typedLine);
                    }
                }

                migrated.lines = processedLines;
            }

            // Preserve all other fields from v1 with proper typing
            if (typeof data.flexMode === 'string')
                migrated.flexMode = data.flexMode as Settings['flexMode'];
            if (typeof data.compactThreshold === 'number')
                migrated.compactThreshold = data.compactThreshold;
            if (typeof data.colorLevel === 'number')
                migrated.colorLevel = data.colorLevel as Settings['colorLevel'];
            if (typeof data.defaultSeparator === 'string')
                migrated.defaultSeparator = data.defaultSeparator;
            if (typeof data.defaultPadding === 'string')
                migrated.defaultPadding = data.defaultPadding;
            if (typeof data.inheritSeparatorColors === 'boolean')
                migrated.inheritSeparatorColors = data.inheritSeparatorColors;
            if (typeof data.overrideBackgroundColor === 'string')
                migrated.overrideBackgroundColor = data.overrideBackgroundColor;
            if (typeof data.overrideForegroundColor === 'string')
                migrated.overrideForegroundColor = data.overrideForegroundColor;
            if (typeof data.globalBold === 'boolean')
                migrated.globalBold = data.globalBold;

            migrated.version = 2;
            return migrated;
        }
    }
    // Add more migrations here as needed for future versions
];

/**
 * Detect the version of the config data
 */
export function detectVersion(data: unknown): number {
    if (!isRecord(data)) {
        return 1;
    }

    // If it has a version field, use it
    if (typeof data.version === 'number') {
        return data.version;
    }

    // No version field means it's the old v1 format
    return 1;
}

/**
 * Migrate config data from its current version to the target version
 */
export function migrateConfig(data: unknown, targetVersion: number): unknown {
    if (!isRecord(data)) {
        return data;
    }

    let currentVersion = detectVersion(data);
    let migrated: Record<string, unknown> = { ...data };

    // Apply migrations sequentially
    while (currentVersion < targetVersion) {
        const migration = migrations.find(m => m.fromVersion === currentVersion
        );

        if (!migration) {
            break;
        }

        migrated = migration.migrate(migrated);
        currentVersion = migration.toVersion;
    }

    return migrated;
}

/**
 * Check if a migration is needed
 */
export function needsMigration(data: unknown, targetVersion: number): boolean {
    return detectVersion(data) < targetVersion;
}