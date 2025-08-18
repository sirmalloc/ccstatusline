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
            // Build a new v2 config from v1 data, only copying known fields
            const migrated: Record<string, unknown> = {};

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

            // Copy all v1 fields that exist
            if (typeof data.flexMode === 'string')
                migrated.flexMode = data.flexMode;
            if (typeof data.compactThreshold === 'number')
                migrated.compactThreshold = data.compactThreshold;
            if (typeof data.colorLevel === 'number')
                migrated.colorLevel = data.colorLevel;
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

            // Add version field for v2
            migrated.version = 2;

            // Add update message for v2 migration
            migrated.updatemessage = {
                message: 'ccstatusline updated to v2.0.0, launch tui to use new settings',
                remaining: 12
            };

            return migrated;
        }
    },
    {
        fromVersion: 2,
        toVersion: 3,
        description: 'Migrate from v2 to v3',
        migrate: (data) => {
            // Copy all existing data to v3
            const migrated: Record<string, unknown> = { ...data };

            // Update version to 3
            migrated.version = 3;

            // Add update message for v3 migration
            migrated.updatemessage = {
                message: 'ccstatusline updated to v2.0.2, 5hr block timer widget added',
                remaining: 12
            };

            return migrated;
        }
    }
];

/**
 * Detect the version of the config data
 */
export function detectVersion(data: unknown): number {
    if (!isRecord(data))
        return 1;

    // If it has a version field, use it
    if (typeof data.version === 'number')
        return data.version;

    // No version field means it's the old v1 format
    return 1;
}

/**
 * Migrate config data from its current version to the target version
 */
export function migrateConfig(data: unknown, targetVersion: number): unknown {
    if (!isRecord(data))
        return data;

    let currentVersion = detectVersion(data);
    let migrated: Record<string, unknown> = { ...data };

    // Apply migrations sequentially
    while (currentVersion < targetVersion) {
        const migration = migrations.find(m => m.fromVersion === currentVersion);

        if (!migration)
            break;

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