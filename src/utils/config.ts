import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    CURRENT_VERSION,
    SettingsSchema,
    SettingsSchema_v1,
    type InstallationMetadata,
    type Settings
} from '../types/Settings';

import type { SkippedWidgetHooks } from './hooks';
import {
    detectVersion,
    migrateConfig,
    needsMigration
} from './migrations';
import { getPackageVersion } from './terminal';
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
const stat = fs.promises.stat;

// Resolved on every call, not once at import time: tests replace os.homedir()
// with a temp directory after this module has loaded, and the default path has
// to follow so an install test can never touch the developer's real file.
function getDefaultSettingsPath(): string {
    return path.join(os.homedir(), '.config', 'ccstatusline', 'settings.json');
}

let settingsPath = getDefaultSettingsPath();
let lastLoadError: string | null = null;
// Whether the last load couldn't back up a migration: its settings are in use, but the
// file keeps the original until a backup of it can be written (see saveSettings)
let unsavedMigration = false;

export function getConfigLoadError(): string | null {
    return lastLoadError;
}

// Why the settings in use, though the user's own, differ from what the file holds
export function getConfigLoadNotice(): string | null {
    return unsavedMigration ? 'settings.json could not be backed up before migrating' : null;
}

export function initConfigPath(filePath?: string): void {
    settingsPath = filePath ? path.resolve(filePath) : getDefaultSettingsPath();
    // A migration held for the previous file doesn't apply to this one
    unsavedMigration = false;
}

export function getConfigPath(): string {
    return settingsPath;
}

export function isCustomConfigPath(): boolean {
    return settingsPath !== getDefaultSettingsPath();
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

// The permissions of the file a save replaces, so a private settings file
// stays private; a new file gets the usual default
async function getReplacedFileMode(filePath: string): Promise<number> {
    try {
        return (await stat(filePath)).mode & 0o777;
    } catch {
        return 0o666;
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
    const mode = await getReplacedFileMode(writeTarget.targetPath);
    try {
        await writeFile(tempPath, JSON.stringify(settings, null, 2), { encoding: 'utf-8', mode });
        await rename(tempPath, writeTarget.targetPath);
    } catch (error) {
        try {
            await unlink(tempPath);
        } catch { /* best-effort cleanup; ignore */ }
        throw error;
    }
}

// Before a migration rewrites the file, the original is kept beside it as
// <file>.v<N>.bak (N being the version it was migrated from), byte for byte. It
// gets the original's permissions, since custom commands can carry credentials, and
// is recreated because an existing file keeps its own permissions when overwritten.
async function writeMigrationBackup(original: Buffer, fromVersion: number, paths: SettingsPaths): Promise<void> {
    const backupPath = `${paths.settingsPath}.v${fromVersion}.bak`;
    const mode = await getReplacedFileMode(paths.settingsPath);
    try {
        await unlink(backupPath);
    } catch (error) {
        if (getErrorCode(error) !== 'ENOENT') {
            throw error;
        }
    }
    await writeFile(backupPath, original, { mode });
}

// The bytes of settings.json and the version they'd be migrated from, or null when it
// is missing or doesn't need migrating
async function readUnmigratedSettings(paths: SettingsPaths): Promise<{ original: Buffer; fromVersion: number } | null> {
    let original: Buffer;
    try {
        original = await readFile(paths.settingsPath);
    } catch (error) {
        if (getErrorCode(error) === 'ENOENT') {
            return null;
        }
        throw error;
    }

    let data: unknown;
    try {
        data = JSON.parse(original.toString('utf-8'));
    } catch {
        return null;
    }
    return needsMigration(data, CURRENT_VERSION)
        ? { original, fromVersion: detectVersion(data) }
        : null;
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
 * migrated to the current version AND the migrated result validates first AND the
 * original has been backed up beside it (see writeMigrationBackup). If that backup
 * can't be written, the migration is returned in memory only (see getConfigLoadNotice)
 * and the next load tries again. All writes go through writeSettingsJson, which is
 * atomic (temp file + rename).
 */
export async function loadSettings(): Promise<Settings> {
    lastLoadError = null;
    unsavedMigration = false;
    const paths = getSettingsPaths();

    try {
        // Check if settings file exists
        if (!fs.existsSync(paths.settingsPath))
            return await writeDefaultSettings(paths);

        const original = await readFile(paths.settingsPath);
        const content = original.toString('utf-8');
        let rawData: unknown;

        try {
            rawData = JSON.parse(content);
        } catch {
            console.error('Failed to parse settings.json, using defaults (file left unchanged)');
            lastLoadError = 'settings.json is not valid JSON';
            return inMemoryDefaults();
        }

        // A config without a version is v1, unless it holds settings that came after v1:
        // then needsMigration reports none and it is validated as the current version
        const hasVersion = typeof rawData === 'object' && rawData !== null && 'version' in rawData;
        let migratedFrom: number | null = null;
        if (needsMigration(rawData, CURRENT_VERSION)) {
            if (!hasVersion) {
                // Parse as v1 to validate before migration
                const v1Result = SettingsSchema_v1.safeParse(rawData);
                if (!v1Result.success) {
                    console.error('Invalid v1 settings format, using defaults (file left unchanged):', v1Result.error);
                    lastLoadError = 'settings.json is not in a valid format';
                    return inMemoryDefaults();
                }
            }

            // Migrate to the current version (persisted below, only once it validates)
            migratedFrom = detectVersion(rawData);
            rawData = migrateConfig(rawData, CURRENT_VERSION);
        }

        // At this point, data should be in current format
        // Parse with main schema which will apply all defaults (a missing version included)
        const result = SettingsSchema.safeParse(rawData);
        if (!result.success) {
            console.error('Failed to parse settings, using defaults (file left unchanged):', result.error);
            lastLoadError = 'settings.json is not in a valid format';
            return inMemoryDefaults();
        }

        // Persist a migration only after the migrated result validates and the original
        // is backed up, so a migration can never overwrite the user's file unrecoverably.
        if (migratedFrom !== null) {
            try {
                await writeMigrationBackup(original, migratedFrom, paths);
            } catch {
                // Without the backup, the migration serves this run from memory and isn't
                // written. Its update message waits as well, since counting it down rewrites
                // the file.
                unsavedMigration = true;
                const { updatemessage, ...migrated } = result.data;
                return {
                    ...migrated,
                    lines: upgradeLegacyWidgetTypes(migrated.lines)
                };
            }
            await writeSettingsJson(rawData, paths);
        }

        return {
            ...result.data,
            lines: upgradeLegacyWidgetTypes(result.data.lines)
        };
    } catch (error) {
        console.error('Error loading settings, using defaults:', error);
        lastLoadError = 'settings.json could not be read';
        return inMemoryDefaults();
    }
}

/** Saves settings and syncs widget hooks; returns the hooks the sync couldn't add, if any. */
export async function saveSettings(settings: Settings): Promise<SkippedWidgetHooks | null> {
    const paths = getSettingsPaths();

    // Replacing a file whose migration is held in memory keeps its original first, and
    // fails without writing if that still can't be done. The file is read again, as it
    // may have changed since the load: edited, which needs those bytes kept instead, or
    // migrated by another run, which has kept its own backup that this mustn't replace.
    if (unsavedMigration) {
        const unmigrated = await readUnmigratedSettings(paths);
        if (unmigrated) {
            await writeMigrationBackup(unmigrated.original, unmigrated.fromVersion, paths);
        }
        unsavedMigration = false;
    }

    // Always include version when saving
    const settingsWithVersion = {
        ...settings,
        version: CURRENT_VERSION
    };

    await writeSettingsJson(settingsWithVersion, paths);

    // Sync widget hooks to Claude settings
    try {
        const { syncWidgetHooks } = await import('./hooks');
        return await syncWidgetHooks(settings);
    } catch {
        // Ignore hook sync failures
        return null;
    }
}

export type ImportValidationResult
    = | { status: 'valid'; data: Settings; presentKeys: (keyof Settings)[] }
        | { status: 'invalid'; reason: string };

function expandPath(filePath: string): string {
    if (filePath.startsWith('~/') || filePath === '~') {
        return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
}

export async function exportConfig(settings: Settings, filePath: string): Promise<void> {
    const expanded = expandPath(filePath);
    const exportData = { ...settings, exportedBy: getPackageVersion() };
    await mkdir(path.dirname(expanded), { recursive: true });
    await writeFile(expanded, JSON.stringify(exportData, null, 2), 'utf-8');
}

export async function validateImportFile(filePath: string): Promise<ImportValidationResult> {
    const expanded = expandPath(filePath);
    let raw: string;
    try {
        raw = await readFile(expanded, 'utf-8');
    } catch {
        return { status: 'invalid', reason: `Cannot read file: ${expanded}` };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { status: 'invalid', reason: 'File is not valid JSON' };
    }

    if (
        typeof parsed === 'object'
        && parsed !== null
        && 'version' in parsed
        && typeof parsed.version === 'number'
        && parsed.version > CURRENT_VERSION
    ) {
        return {
            status: 'invalid',
            reason: `Config version ${parsed.version} is newer than supported version ${CURRENT_VERSION}`
        };
    }

    const migrated = needsMigration(parsed, CURRENT_VERSION) ? migrateConfig(parsed, CURRENT_VERSION) : parsed;

    const result = SettingsSchema.safeParse(migrated);
    if (!result.success) {
        return { status: 'invalid', reason: `Invalid config format: ${result.error.issues[0]?.message ?? 'unknown error'}` };
    }

    // The keys the file holds that survived migration: a merge applies what the
    // file sets, never the version and update message a migration adds, nor a
    // default standing in for a value the v1 migration dropped as invalid
    const migratedKeys = new Set(Object.keys(migrated as Record<string, unknown>));
    const presentKeys = Object.keys(parsed as Record<string, unknown>)
        .filter((key): key is keyof Settings => migratedKeys.has(key) && key in result.data);

    return { status: 'valid', data: result.data, presentKeys };
}

const IMPORT_EXCLUDED_KEYS = ['installation', 'version', 'updatemessage', 'exportedBy'] as const;
type ImportExcludedKey = typeof IMPORT_EXCLUDED_KEYS[number];

export function applyImport(
    current: Settings,
    imported: Settings,
    mode: 'replace' | 'merge',
    presentKeys: readonly (keyof Settings)[] = Object.keys(imported) as (keyof Settings)[]
): Settings {
    const mergeKeys = new Set(presentKeys);
    const importedClean = Object.fromEntries(
        Object.entries(imported).filter(([k]) => !IMPORT_EXCLUDED_KEYS.includes(k as ImportExcludedKey)
            && (mode === 'replace' || mergeKeys.has(k as keyof Settings))
        )
    ) as Partial<Settings>;

    if (mode === 'replace') {
        return SettingsSchema.parse({
            ...importedClean,
            installation: current.installation
        });
    }
    return { ...current, ...importedClean };
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
    // Nor when the load just failed to back it up before migrating: writing would put
    // the migration over it with no copy of the original
    if (getConfigLoadNotice() !== null) {
        console.error('Skipping installation-metadata write: settings.json could not be backed up before migrating (left unchanged).');
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
