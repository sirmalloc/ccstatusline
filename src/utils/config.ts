import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import { ColorLevelSchema } from '../types/ColorLevel';
import { FlexModeSchema } from '../types/FlexMode';
import {
    CURRENT_VERSION,
    SettingsSchema,
    type Settings
} from '../types/Settings';
import { WidgetItemSchema } from '../types/Widget';

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

// Schema for loading legacy settings (before version field)
const LegacyLoadSchema = z.object({
    // Support old 'items' field name (single line)
    items: z.array(WidgetItemSchema).optional(),
    // Current 'lines' field (multiple lines)
    lines: z.array(z.array(WidgetItemSchema)).optional(),
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

        // No need to filter widget types anymore - we accept any string type

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