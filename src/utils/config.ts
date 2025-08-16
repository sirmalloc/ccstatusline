import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import {
    migrateConfig,
    needsMigration
} from './migrations';

// Use fs.promises directly (always available in modern Node.js)
const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;
const mkdir = fs.promises.mkdir;

const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccstatusline');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const SETTINGS_BACKUP_PATH = path.join(CONFIG_DIR, 'settings.bak');

// Current version - bump this when making breaking changes to the schema
const CURRENT_VERSION = 2;

// Known widget types
const KNOWN_WIDGET_TYPES = [
    'model', 'git-branch', 'git-changes', 'separator', 'flex-separator',
    'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total',
    'context-length', 'context-percentage', 'context-percentage-usable',
    'terminal-width', 'session-clock', 'version', 'custom-text', 'custom-command'
] as const;

// Widget item type enum - strict for type safety
const WidgetItemTypeSchema = z.enum(KNOWN_WIDGET_TYPES);

// Safe widget type schema for loading - accepts unknown types
const SafeWidgetTypeSchema = z.union([
    WidgetItemTypeSchema,
    z.string() // Accept any string for forward compatibility
]);

// Widget item schema for type exports
const WidgetItemSchema = z.object({
    id: z.string(),
    type: WidgetItemTypeSchema,
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    bold: z.boolean().optional(),
    character: z.string().optional(),
    rawValue: z.boolean().optional(),
    customText: z.string().optional(),
    commandPath: z.string().optional(),
    maxWidth: z.number().optional(),
    preserveColors: z.boolean().optional(),
    timeout: z.number().optional(),
    merge: z.union([z.boolean(), z.literal('no-padding')]).optional()
});

// Safe widget item schema for loading - handles unknown types
const SafeWidgetItemSchema = z.object({
    id: z.string(),
    type: SafeWidgetTypeSchema, // Accept any string type
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    bold: z.boolean().optional(),
    character: z.string().optional(),
    rawValue: z.boolean().optional(),
    customText: z.string().optional(),
    commandPath: z.string().optional(),
    maxWidth: z.number().optional(),
    preserveColors: z.boolean().optional(),
    timeout: z.number().optional(),
    merge: z.union([z.boolean(), z.literal('no-padding')]).optional()
});

// Flex mode enum
const FlexModeSchema = z.enum(['full', 'full-minus-40', 'full-until-compact']);

// Color level schema
const ColorLevelSchema = z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3)
]);

// Powerline configuration schema with defaults
const PowerlineConfigSchema = z.object({
    enabled: z.boolean().default(false),
    separators: z.array(z.string()).default(['\uE0B0']),
    separatorInvertBackground: z.array(z.boolean()).default([false]),
    startCaps: z.array(z.string()).default([]),
    endCaps: z.array(z.string()).default([]),
    theme: z.string().optional()
});

// Helper to filter and validate widget items
const filterValidWidgets = (items: unknown[]): z.infer<typeof WidgetItemSchema>[] => {
    const validItems: z.infer<typeof WidgetItemSchema>[] = [];

    for (const item of items) {
        const parsed = SafeWidgetItemSchema.safeParse(item);
        if (parsed.success) {
            // Check if it's a known widget type
            const typeStr = parsed.data.type;
            if (KNOWN_WIDGET_TYPES.includes(typeStr as typeof KNOWN_WIDGET_TYPES[number])) {
                validItems.push(parsed.data as z.infer<typeof WidgetItemSchema>);
            } else {
                console.warn(`Warning: Skipping unknown widget type '${parsed.data.type}' (id: ${parsed.data.id}). This may be from a newer version.`);
            }
        }
    }

    return validItems;
};

// Main settings schema with defaults
const SettingsSchema = z.object({
    version: z.number().default(CURRENT_VERSION),
    lines: z.array(z.array(WidgetItemSchema))
        .min(1)
        .max(3)
        .default([
            [
                { id: '1', type: 'model', color: 'cyan' },
                { id: '2', type: 'separator' },
                { id: '3', type: 'context-length', color: 'brightBlack' },
                { id: '4', type: 'separator' },
                { id: '5', type: 'git-branch', color: 'magenta' },
                { id: '6', type: 'separator' },
                { id: '7', type: 'git-changes', color: 'yellow' }
            ]
        ])
        .transform(lines => lines.slice(0, 3)), // Ensure max 3 lines
    flexMode: FlexModeSchema.default('full-minus-40'),
    compactThreshold: z.number().min(1).max(99).default(60),
    colorLevel: ColorLevelSchema.default(2),
    defaultSeparator: z.string().optional(),
    defaultPadding: z.string().optional(),
    inheritSeparatorColors: z.boolean().default(false),
    overrideBackgroundColor: z.string().optional(),
    overrideForegroundColor: z.string().optional(),
    globalBold: z.boolean().default(false),
    powerline: PowerlineConfigSchema.default({
        enabled: false,
        separators: ['\uE0B0'],
        separatorInvertBackground: [false],
        startCaps: [],
        endCaps: [],
        theme: undefined
    })
});

// Inferred types from Zod schemas
export type WidgetItem = z.infer<typeof WidgetItemSchema>;
export type WidgetItemType = z.infer<typeof WidgetItemTypeSchema>;
export type FlexMode = z.infer<typeof FlexModeSchema>;
export type PowerlineConfig = z.infer<typeof PowerlineConfigSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type ColorLevelString = 'ansi16' | 'ansi256' | 'truecolor';

// Re-export for backward compatibility
export { WidgetItemSchema, WidgetItemTypeSchema };

// Helper to get color level as string for chalk
export function getColorLevelString(level: 0 | 1 | 2 | 3 | undefined): ColorLevelString {
    switch (level) {
    case 0:
    case 1:
        return 'ansi16';
    case 3:
        return 'truecolor';
    case 2:
    default:
        return 'ansi256';
    }
}

// Schema for loading legacy settings (before version field)
const LegacyLoadSchema = z.object({
    // Support old 'items' field name (single line)
    items: z.array(SafeWidgetItemSchema).optional(),
    // Current 'lines' field (multiple lines)
    lines: z.array(z.array(SafeWidgetItemSchema)).optional(),
    flexMode: FlexModeSchema.optional(),
    compactThreshold: z.number().optional(),
    colorLevel: ColorLevelSchema.optional(),
    defaultSeparator: z.string().optional(),
    defaultPadding: z.string().optional(),
    inheritSeparatorColors: z.boolean().optional(),
    overrideBackgroundColor: z.string().optional(),
    overrideForegroundColor: z.string().optional(),
    globalBold: z.boolean().optional(),
    powerline: z.object({
        enabled: z.boolean().optional(),
        separators: z.array(z.string()).optional(),
        separatorInvertBackground: z.array(z.boolean()).optional(),
        startCaps: z.array(z.string()).optional(),
        endCaps: z.array(z.string()).optional(),
        theme: z.string().optional()
    }).optional(),
    // Version might not exist in old configs
    version: z.number().optional()
}); // Remove passthrough as it's deprecated

async function backupBadSettings(): Promise<void> {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const content = await readFile(SETTINGS_PATH, 'utf-8');
            await writeFile(SETTINGS_BACKUP_PATH, content, 'utf-8');
            console.error(`Bad settings backed up to ${SETTINGS_BACKUP_PATH}`);
        }
    } catch (error) {
        console.error('Failed to backup bad settings:', error);
    }
}

async function writeDefaultSettings(): Promise<Settings> {
    const defaults = SettingsSchema.parse({});
    const settingsWithVersion = {
        ...defaults,
        version: CURRENT_VERSION
    };

    try {
        await mkdir(CONFIG_DIR, { recursive: true });
        await writeFile(SETTINGS_PATH, JSON.stringify(settingsWithVersion, null, 2), 'utf-8');
        console.error(`Default settings written to ${SETTINGS_PATH}`);
    } catch (error) {
        console.error('Failed to write default settings:', error);
    }

    return defaults;
}

export async function loadSettings(): Promise<Settings> {
    try {
        // Check if settings file exists
        if (!fs.existsSync(SETTINGS_PATH)) {
            // Create default settings file
            return await writeDefaultSettings();
        }

        const content = await readFile(SETTINGS_PATH, 'utf-8');
        let rawData: unknown;

        try {
            rawData = JSON.parse(content);
        } catch {
            // If we can't parse the JSON, backup and write defaults
            console.error('Failed to parse settings.json, backing up and using defaults');
            await backupBadSettings();
            return await writeDefaultSettings();
        }

        // Check if migration is needed
        if (needsMigration(rawData, CURRENT_VERSION)) {
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            // Save the migrated settings back to disk
            await writeFile(SETTINGS_PATH, JSON.stringify(rawData, null, 2), 'utf-8');
        }

        // Try to parse with legacy schema to get a loose validation
        const legacyParsed = LegacyLoadSchema.safeParse(rawData);

        if (!legacyParsed.success) {
            console.error('Invalid settings format after migration, backing up and using defaults');
            await backupBadSettings();
            return await writeDefaultSettings();
        }

        const data = legacyParsed.data;

        // Prepare data for main schema parsing
        const settingsInput: Record<string, unknown> = { ...data };

        // Filter out unknown widget types from lines
        if (settingsInput.lines && Array.isArray(settingsInput.lines)) {
            settingsInput.lines = settingsInput.lines.map(line => Array.isArray(line) ? filterValidWidgets(line) : []
            ).filter(line => line.length > 0); // Remove empty lines

            // If all lines were filtered out, use defaults
            if ((settingsInput.lines as unknown[]).length === 0) {
                delete settingsInput.lines;
            }
        }

        // Parse with main schema which will apply all defaults
        const result = SettingsSchema.safeParse(settingsInput);

        if (!result.success) {
            console.error('Failed to parse settings with main schema:', result.error);
            await backupBadSettings();
            return await writeDefaultSettings();
        }

        return result.data;
    } catch (error) {
        // Any other error, backup and write defaults
        console.error('Error loading settings:', error);
        await backupBadSettings();
        return await writeDefaultSettings();
    }
}

export async function saveSettings(settings: Settings): Promise<void> {
    // Ensure config directory exists
    await mkdir(CONFIG_DIR, { recursive: true });

    // Always include version when saving
    const settingsWithVersion = {
        ...settings,
        version: CURRENT_VERSION
    };

    // Write settings using Node.js-compatible API
    await writeFile(SETTINGS_PATH, JSON.stringify(settingsWithVersion, null, 2), 'utf-8');
}

// Export a default settings constant for reference
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});