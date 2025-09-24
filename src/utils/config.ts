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
export const mkdir = async (path: string) => fs.promises.mkdir(path, { recursive: true });
export const readFile = async (path: string) => fs.promises.readFile(path, 'utf-8');
export const writeFile = async (path: string, content: string) => fs.promises.writeFile(path, content, 'utf-8');

export function getSettingsConfiguration(type?: 'global' | 'project') {
    const projectConfig = path.join(process.cwd(), '.claude', 'ccstatusline.json');

    if ((type === 'project') || (!type && fs.existsSync(projectConfig))) {
        return {
            configDir: path.dirname(projectConfig),
            path: projectConfig,
            relativePath: path.relative(process.cwd(), projectConfig),
            type: 'project'
        };
    }

    const userConfigDir = path.join(os.homedir(), '.config', 'ccstatusline');
    const userConfig = path.join(userConfigDir, 'settings.json');

    // Fallback to global config
    return {
        configDir: userConfigDir,
        path: userConfig,
        relativePath: '~/' + path.relative(os.homedir(), userConfig),
        type: 'global'
    };
}

async function backupBadSettings(): Promise<void> {
    try {
        const { path: settingsPath } = getSettingsConfiguration();
        const settingsBackupPath = settingsPath.replace('.json', '.json.bak');

        if (fs.existsSync(settingsPath)) {
            const content = await readFile(settingsPath);
            await writeFile(settingsBackupPath, content);
            console.error(`Bad settings backed up to ${settingsBackupPath}`);
        }
    } catch (error) {
        console.error('Failed to backup bad settings:', error);
    }
}

async function writeDefaultSettings(): Promise<Settings> {
    const defaults = SettingsSchema.parse({});

    try {
        const { path: settingsPath } = await saveSettings(defaults);
        console.error(`Default settings written to ${settingsPath}`);
    } catch (error) {
        console.error('Failed to write default settings:', error);
    }

    return defaults;
}

export async function loadSettings(): Promise<Settings> {
    try {
        const { path: settingsPath } = getSettingsConfiguration();

        // Check if settings file exists
        if (!fs.existsSync(settingsPath))
            return await writeDefaultSettings();

        const content = await readFile(settingsPath);
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
            await writeFile(settingsPath, JSON.stringify(rawData, null, 2));
        } else if (needsMigration(rawData, CURRENT_VERSION)) {
            // Handle migrations for versioned configs (v2+) and save the migrated settings back to disk
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            await writeFile(settingsPath, JSON.stringify(rawData, null, 2));
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

export async function saveSettings(settings: Settings, type?: 'global' | 'project') {
    const { path, configDir } = getSettingsConfiguration(type);

    // Ensure config directory exists
    await mkdir(configDir);

    // Always include version when saving
    const settingsWithVersion = {
        ...settings,
        version: CURRENT_VERSION
    };

    // Write settings using Node.js-compatible API
    await writeFile(path, JSON.stringify(settingsWithVersion, null, 2));

    return {
        settings: settingsWithVersion,
        path
    };
}