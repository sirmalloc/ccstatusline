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

const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), '.config', 'ccstatusline', 'settings.json');

let settingsPath = DEFAULT_SETTINGS_PATH;

export function initConfigPath(filePath?: string): void {
    settingsPath = filePath ? path.resolve(filePath) : DEFAULT_SETTINGS_PATH;
}

export function getConfigPath(): string {
    return settingsPath;
}

export function isCustomConfigPath(): boolean {
    return settingsPath !== DEFAULT_SETTINGS_PATH;
}

interface SettingsPaths {
    configDir: string;
    settingsPath: string;
    settingsBackupPath: string;
}

function getSettingsPaths(): SettingsPaths {
    const configDir = path.dirname(settingsPath);
    const parsedPath = path.parse(settingsPath);
    const backupBaseName = parsedPath.ext
        ? `${parsedPath.name}.bak`
        : `${parsedPath.base}.bak`;

    return {
        configDir,
        settingsPath,
        settingsBackupPath: path.join(configDir, backupBaseName)
    };
}

async function writeSettingsJson(settings: unknown, paths: SettingsPaths): Promise<void> {
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

async function backupBadSettings(paths: SettingsPaths): Promise<void> {
    try {
        if (fs.existsSync(paths.settingsPath)) {
            const content = await readFile(paths.settingsPath, 'utf-8');
            await writeFile(paths.settingsBackupPath, content, 'utf-8');
            console.error(`Bad settings backed up to ${paths.settingsBackupPath}`);
        }
    } catch (error) {
        console.error('Failed to backup bad settings:', error);
    }
}

async function writeDefaultSettings(paths: SettingsPaths): Promise<Settings> {
    const defaults = SettingsSchema.parse({});
    const settingsWithVersion = {
        ...defaults,
        version: CURRENT_VERSION
    };

    try {
        await writeSettingsJson(settingsWithVersion, paths);
        console.error(`Default settings written to ${paths.settingsPath}`);
    } catch (error) {
        console.error('Failed to write default settings:', error);
    }

    return defaults;
}

async function recoverWithDefaults(paths: SettingsPaths): Promise<Settings> {
    await backupBadSettings(paths);
    return await writeDefaultSettings(paths);
}

export async function loadSettings(): Promise<Settings> {
    const paths = getSettingsPaths();

    try {
        // Check if settings file exists
        if (!fs.existsSync(paths.settingsPath))
            return await writeDefaultSettings(paths);

        const content = await readFile(paths.settingsPath, 'utf-8');
        let rawData: unknown;

        try {
            rawData = JSON.parse(content);
        } catch {
            // If we can't parse the JSON, backup and write defaults
            console.error('Failed to parse settings.json, backing up and using defaults');
            return await recoverWithDefaults(paths);
        }

        // Check if this is a v1 config (no version field)
        const hasVersion = typeof rawData === 'object' && rawData !== null && 'version' in rawData;
        if (!hasVersion) {
            // Parse as v1 to validate before migration
            const v1Result = SettingsSchema_v1.safeParse(rawData);
            if (!v1Result.success) {
                console.error('Invalid v1 settings format:', v1Result.error);
                return await recoverWithDefaults(paths);
            }

            // Migrate v1 to current version and save the migrated settings back to disk
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            await writeSettingsJson(rawData, paths);
        } else if (needsMigration(rawData, CURRENT_VERSION)) {
            // Handle migrations for versioned configs (v2+) and save the migrated settings back to disk
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            await writeSettingsJson(rawData, paths);
        }

        // At this point, data should be in current format with version field
        // Parse with main schema which will apply all defaults
        const result = SettingsSchema.safeParse(rawData);
        if (!result.success) {
            console.error('Failed to parse settings:', result.error);
            return await recoverWithDefaults(paths);
        }

        return result.data;
    } catch (error) {
        // Any other error, backup and write defaults
        console.error('Error loading settings:', error);
        return await recoverWithDefaults(paths);
    }
}

export async function saveSettings(settings: Settings): Promise<void> {
    const paths = getSettingsPaths();

    // Always include version when saving
    const settingsWithVersion = {
        ...settings,
        version: CURRENT_VERSION
    };

    await writeSettingsJson(settingsWithVersion, paths);
}