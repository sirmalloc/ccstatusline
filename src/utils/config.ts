import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
    CURRENT_VERSION,
    SettingsSchema,
    SettingsSchema_v1,
    type Settings
} from '../types/Settings';

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
        if (!fs.existsSync(SETTINGS_PATH))
            return await writeDefaultSettings();

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

        // Check if this is a v1 config (no version field)
        const hasVersion = typeof rawData === 'object' && rawData !== null && 'version' in rawData;
        if (!hasVersion) {
            // Parse as v1 to validate before migration
            const v1Result = SettingsSchema_v1.safeParse(rawData);
            if (!v1Result.success) {
                console.error('Invalid v1 settings format:', v1Result.error);
                await backupBadSettings();
                return await writeDefaultSettings();
            }

            // Migrate v1 to current version and save the migrated settings back to disk
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            await writeFile(SETTINGS_PATH, JSON.stringify(rawData, null, 2), 'utf-8');
        } else if (needsMigration(rawData, CURRENT_VERSION)) {
            // Handle migrations for versioned configs (v2+) and save the migrated settings back to disk
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            await writeFile(SETTINGS_PATH, JSON.stringify(rawData, null, 2), 'utf-8');
        }

        // At this point, data should be in current format with version field
        // Parse with main schema which will apply all defaults
        const result = SettingsSchema.safeParse(rawData);
        if (!result.success) {
            console.error('Failed to parse settings:', result.error);
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