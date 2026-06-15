import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
    CURRENT_VERSION,
    SettingsSchema,
    SettingsSchema_v1,
    type InstallationMetadata,
    type Settings
} from '../types/Settings';

import {
    migrateConfig,
    needsMigration
} from './migrations';
import { upgradeLegacyWidgetTypes } from './widgets';

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
}

function getSettingsPaths(): SettingsPaths {
    return {
        configDir: path.dirname(settingsPath),
        settingsPath
    };
}

async function writeSettingsJson(settings: unknown, paths: SettingsPaths): Promise<void> {
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function inMemoryDefaults(): Settings {
    // Defaults held in memory only (version included via the schema default).
    // Returned on recovery without writing, so a malformed file is preserved.
    return SettingsSchema.parse({});
}

async function writeDefaultSettings(paths: SettingsPaths): Promise<Settings> {
    const defaults = inMemoryDefaults();
    try {
        await writeSettingsJson(defaults, paths);
        console.error(`Default settings written to ${paths.settingsPath}`);
    } catch (error) {
        console.error('Failed to write default settings:', error);
    }

    return defaults;
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
            console.error('Failed to parse settings.json, using defaults (file left unchanged)');
            return inMemoryDefaults();
        }

        // Check if this is a v1 config (no version field)
        const hasVersion = typeof rawData === 'object' && rawData !== null && 'version' in rawData;
        if (!hasVersion) {
            // Parse as v1 to validate before migration
            const v1Result = SettingsSchema_v1.safeParse(rawData);
            if (!v1Result.success) {
                console.error('Invalid v1 settings format, using defaults (file left unchanged):', v1Result.error);
                return inMemoryDefaults();
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
            console.error('Failed to parse settings, using defaults (file left unchanged):', result.error);
            return inMemoryDefaults();
        }

        return {
            ...result.data,
            lines: upgradeLegacyWidgetTypes(result.data.lines)
        };
    } catch (error) {
        console.error('Error loading settings, using defaults:', error);
        return inMemoryDefaults();
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

    // Sync widget hooks to Claude settings
    try {
        const { syncWidgetHooks } = await import('./hooks');
        await syncWidgetHooks(settings);
    } catch { /* ignore hook sync failures */ }
}

export async function saveInstallationMetadata(metadata: InstallationMetadata | undefined): Promise<void> {
    const paths = getSettingsPaths();
    if (!metadata && !fs.existsSync(paths.settingsPath)) {
        return;
    }

    const settings = await loadSettings();
    const settingsWithVersion: Settings & { version: number } = {
        ...settings,
        version: CURRENT_VERSION
    };

    if (metadata) {
        settingsWithVersion.installation = metadata;
    } else {
        delete settingsWithVersion.installation;
    }

    await writeSettingsJson(settingsWithVersion, paths);
}
