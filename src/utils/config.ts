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
const rename = fs.promises.rename;
const unlink = fs.promises.unlink;
const lstat = fs.promises.lstat;
const readlink = fs.promises.readlink;
const realpath = fs.promises.realpath;

const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), '.config', 'ccstatusline', 'settings.json');

let settingsPath = DEFAULT_SETTINGS_PATH;
let lastLoadError: string | null = null;

export function getConfigLoadError(): string | null {
    return lastLoadError;
}

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

interface AtomicWriteTarget {
    targetPath: string;
    tempDir: string;
}

function getSettingsPaths(): SettingsPaths {
    return {
        configDir: path.dirname(settingsPath),
        settingsPath
    };
}

function getErrorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;
}

async function resolveSymlinkTarget(linkPath: string): Promise<string> {
    try {
        return await realpath(linkPath);
    } catch (error) {
        if (getErrorCode(error) !== 'ENOENT') {
            throw error;
        }

        const linkTarget = await readlink(linkPath);
        return path.resolve(path.dirname(linkPath), linkTarget);
    }
}

async function resolveAtomicWriteTarget(paths: SettingsPaths): Promise<AtomicWriteTarget> {
    try {
        const stats = await lstat(paths.settingsPath);
        if (!stats.isSymbolicLink()) {
            return {
                targetPath: paths.settingsPath,
                tempDir: paths.configDir
            };
        }

        const targetPath = await resolveSymlinkTarget(paths.settingsPath);
        return {
            targetPath,
            tempDir: path.dirname(targetPath)
        };
    } catch (error) {
        if (getErrorCode(error) === 'ENOENT') {
            return {
                targetPath: paths.settingsPath,
                tempDir: paths.configDir
            };
        }

        throw error;
    }
}

async function writeSettingsJson(settings: unknown, paths: SettingsPaths): Promise<void> {
    await mkdir(paths.configDir, { recursive: true });

    // Write to a unique temp file in the same directory, then atomically rename
    // over the target. A concurrent reader (e.g. the statusline render path firing
    // mid-save) sees either the complete old file or the complete new file, never a
    // torn write. Same idiom as git.ts:writePersistentCache.
    const writeTarget = await resolveAtomicWriteTarget(paths);
    const tempPath = path.join(
        writeTarget.tempDir,
        `${path.basename(writeTarget.targetPath)}.${process.pid}.${Date.now()}.tmp`
    );
    try {
        await writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf-8');
        await rename(tempPath, writeTarget.targetPath);
    } catch (error) {
        try {
            await unlink(tempPath);
        } catch { /* best-effort cleanup; ignore */ }
        throw error;
    }
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

/**
 * Load ccstatusline settings from disk.
 *
 * Recovery contract: if the file cannot be read or fails validation, loadSettings
 * NEVER overwrites it — it returns built-in defaults in memory, records the reason
 * (see getConfigLoadError), and leaves the file untouched for the user to fix. The
 * file is written only when it is missing (first run), or when a readable config is
 * migrated to the current version AND the migrated result validates first. All writes
 * go through writeSettingsJson, which is atomic (temp file + rename).
 */
export async function loadSettings(): Promise<Settings> {
    lastLoadError = null;
    const paths = getSettingsPaths();
    // Project scope loads .claude/ccstatusline.json, and --config accepts any file
    // name; derive the display name once so error text/console output always names
    // the file actually in play instead of hard-coding "settings.json".
    const fileName = path.basename(paths.settingsPath);

    try {
        // Check if settings file exists
        if (!fs.existsSync(paths.settingsPath))
            return await writeDefaultSettings(paths);

        const content = await readFile(paths.settingsPath, 'utf-8');
        let rawData: unknown;

        try {
            rawData = JSON.parse(content);
        } catch {
            console.error(`Failed to parse ${fileName}, using defaults (file left unchanged)`);
            lastLoadError = `${fileName} is not valid JSON`;
            return inMemoryDefaults();
        }

        // Check if this is a v1 config (no version field)
        const hasVersion = typeof rawData === 'object' && rawData !== null && 'version' in rawData;
        let migrated = false;
        if (!hasVersion) {
            // Parse as v1 to validate before migration
            const v1Result = SettingsSchema_v1.safeParse(rawData);
            if (!v1Result.success) {
                console.error('Invalid v1 settings format, using defaults (file left unchanged):', v1Result.error);
                lastLoadError = `${fileName} is not in a valid format`;
                return inMemoryDefaults();
            }

            // Migrate v1 to the current version (persisted below, only once it validates)
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            migrated = true;
        } else if (needsMigration(rawData, CURRENT_VERSION)) {
            // Migrate versioned configs (v2+) to current (persisted below, only once it validates)
            rawData = migrateConfig(rawData, CURRENT_VERSION);
            migrated = true;
        }

        // At this point, data should be in current format with version field
        // Parse with main schema which will apply all defaults
        const result = SettingsSchema.safeParse(rawData);
        if (!result.success) {
            console.error('Failed to parse settings, using defaults (file left unchanged):', result.error);
            lastLoadError = `${fileName} is not in a valid format`;
            return inMemoryDefaults();
        }

        // Persist a migration only after the migrated result validates, so a faulty
        // migration can never overwrite the user's original file.
        if (migrated) {
            await writeSettingsJson(rawData, paths);
        }

        return {
            ...result.data,
            lines: upgradeLegacyWidgetTypes(result.data.lines)
        };
    } catch (error) {
        console.error('Error loading settings, using defaults:', error);
        lastLoadError = `${fileName} could not be read`;
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

    // If the existing settings.json couldn't be read, don't overwrite it just to
    // record installation metadata — that would discard the user's (recoverable)
    // file. Metadata is non-critical and is persisted on the next clean save.
    if (getConfigLoadError() !== null) {
        console.error('Skipping installation-metadata write: settings.json is unreadable (left unchanged).');
        return;
    }

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
