import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import {
    CURRENT_VERSION,
    DEFAULT_SETTINGS,
    type InstallationMetadata,
    type Settings
} from '../../types/Settings';
import type { ImportValidationResult } from '../config';

// Unique per run, so test runs going at once don't delete each other's files
const MOCK_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-config-test-home-'));
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

let loadSettings: () => Promise<Settings>;
let saveSettings: (settings: Settings) => Promise<void>;
let exportConfig: (settings: Settings, filePath: string) => Promise<void>;
let validateImportFile: (filePath: string) => Promise<ImportValidationResult>;
let applyImport: (
    current: Settings,
    imported: Settings,
    mode: 'replace' | 'merge',
    presentKeys?: readonly (keyof Settings)[]
) => Settings;
let initConfigPath: (filePath?: string) => void;
let getConfigLoadError: () => string | null;
let getConfigLoadNotice: () => string | null;
let saveInstallationMetadata: (metadata: InstallationMetadata | undefined) => Promise<void>;
let consoleErrorSpy: MockInstance<typeof console.error>;

function getSettingsPaths(): { configDir: string; settingsPath: string; backupPath: string } {
    const configDir = path.join(MOCK_HOME_DIR, '.config', 'ccstatusline');
    return {
        configDir,
        settingsPath: path.join(configDir, 'settings.json'),
        backupPath: path.join(configDir, 'settings.bak')
    };
}

function getClaudeConfigDir(): string {
    return path.join(MOCK_HOME_DIR, '.claude');
}

// A v2 settings.json whose migration backup can't be written, because a directory
// stands where it goes. Removing the directory lets the backup be written.
function writeV2SettingsWithBlockedBackup(): { original: string; backupPath: string } {
    const { settingsPath, configDir } = getSettingsPaths();
    fs.mkdirSync(configDir, { recursive: true });
    const original = JSON.stringify({
        version: 2,
        lines: [[{ id: 'widget-1', type: 'git-branch', metadata: { hideNoGit: 'true' } }]],
        flexMode: 'full-minus-40'
    });
    fs.writeFileSync(settingsPath, original, 'utf-8');
    const backupPath = `${settingsPath}.v2.bak`;
    fs.mkdirSync(backupPath);
    return { original, backupPath };
}

describe('config utilities', () => {
    beforeAll(async () => {
        const configModule = await import('../config');
        loadSettings = configModule.loadSettings;
        saveSettings = configModule.saveSettings;
        exportConfig = configModule.exportConfig;
        validateImportFile = configModule.validateImportFile;
        applyImport = configModule.applyImport;
        initConfigPath = configModule.initConfigPath;
        getConfigLoadError = configModule.getConfigLoadError;
        getConfigLoadNotice = configModule.getConfigLoadNotice;
        saveInstallationMetadata = configModule.saveInstallationMetadata;
    });

    beforeEach(() => {
        fs.rmSync(MOCK_HOME_DIR, { recursive: true, force: true });
        process.env.CLAUDE_CONFIG_DIR = getClaudeConfigDir();
        const { settingsPath } = getSettingsPaths();
        initConfigPath(settingsPath);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    afterAll(() => {
        fs.rmSync(MOCK_HOME_DIR, { recursive: true, force: true });
        if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
        }
        initConfigPath();
    });

    it('writes defaults when settings file does not exist', async () => {
        const { settingsPath } = getSettingsPaths();

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.existsSync(settingsPath)).toBe(true);

        const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            version?: number;
            lines?: unknown[];
        };
        expect(onDisk.version).toBe(CURRENT_VERSION);
        expect(Array.isArray(onDisk.lines)).toBe(true);
        expect(settings.gitCacheTtlSeconds).toBe(5);
        expect((onDisk as { gitCacheTtlSeconds?: number }).gitCacheTtlSeconds).toBe(5);
        // Custom command caching is opt-in, so an untouched install keeps running
        // the command on every repaint.
        expect(settings.customCommandCacheTtlSeconds).toBe(0);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Default settings written to')
        );
    });

    it('exports the provided in-memory settings instead of reloading stale settings from disk', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        const exportPath = path.join(configDir, 'export.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({ ...DEFAULT_SETTINGS, globalBold: false }),
            'utf-8'
        );

        await exportConfig({ ...DEFAULT_SETTINGS, globalBold: true }, exportPath);

        const exported = JSON.parse(fs.readFileSync(exportPath, 'utf-8')) as {
            globalBold?: boolean;
            exportedBy?: string;
        };
        expect(exported.globalBold).toBe(true);
        expect(exported.exportedBy).toBeTruthy();
    });

    it('preserves current settings omitted from a merge import', async () => {
        const { configDir } = getSettingsPaths();
        const importPath = path.join(configDir, 'partial-import.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            importPath,
            JSON.stringify({ version: CURRENT_VERSION, globalBold: true }),
            'utf-8'
        );
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full',
            compactThreshold: 75,
            lines: [[{ id: 'custom', type: 'model' }]]
        };

        const validation = await validateImportFile(importPath);

        expect(validation.status).toBe('valid');
        if (validation.status !== 'valid') {
            return;
        }
        const merged = applyImport(current, validation.data, 'merge', validation.presentKeys);
        expect(merged.globalBold).toBe(true);
        expect(merged.flexMode).toBe('full');
        expect(merged.compactThreshold).toBe(75);
        expect(merged.lines).toEqual(current.lines);
    });

    it('rejects imports created by a newer schema version', async () => {
        const { configDir } = getSettingsPaths();
        const importPath = path.join(configDir, 'future-import.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            importPath,
            JSON.stringify({
                version: CURRENT_VERSION + 1,
                lines: [[], [], []],
                futureSetting: 'unsupported'
            }),
            'utf-8'
        );

        const validation = await validateImportFile(importPath);

        expect(validation).toEqual({
            status: 'invalid',
            reason: `Config version ${CURRENT_VERSION + 1} is newer than supported version ${CURRENT_VERSION}`
        });
    });

    it('rejects imports whose version is not a number', async () => {
        const { configDir } = getSettingsPaths();
        const importPath = path.join(configDir, 'string-version-import.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            importPath,
            JSON.stringify({
                version: String(CURRENT_VERSION),
                lines: [[{ id: 'widget-1', type: 'model' }]],
                minimalistMode: true
            }),
            'utf-8'
        );

        const validation = await validateImportFile(importPath);

        expect(validation.status).toBe('invalid');
    });

    it('imports a file without a version as current settings when it holds settings added after v1', async () => {
        const { configDir } = getSettingsPaths();
        const importPath = path.join(configDir, 'versionless-import.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            importPath,
            JSON.stringify({
                lines: [[{ id: 'widget-1', type: 'model' }]],
                powerline: { enabled: true, theme: 'nord' },
                gitCacheTtlSeconds: 30
            }),
            'utf-8'
        );

        const validation = await validateImportFile(importPath);

        expect(validation.status).toBe('valid');
        if (validation.status !== 'valid') {
            return;
        }
        expect(validation.presentKeys).toEqual(['lines', 'powerline', 'gitCacheTtlSeconds']);
        const merged = applyImport(DEFAULT_SETTINGS, validation.data, 'merge', validation.presentKeys);
        expect(merged.lines).toEqual([[{ id: 'widget-1', type: 'model' }]]);
        expect(merged.powerline.enabled).toBe(true);
        expect(merged.powerline.theme).toBe('nord');
        expect(merged.gitCacheTtlSeconds).toBe(30);
        const replaced = applyImport(DEFAULT_SETTINGS, validation.data, 'replace', validation.presentKeys);
        expect(replaced.powerline.enabled).toBe(true);
        expect(replaced.gitCacheTtlSeconds).toBe(30);
        expect(replaced.updatemessage).toBeUndefined();
    });

    it('migrates a v1 import and merges only the keys the file holds', async () => {
        const { configDir } = getSettingsPaths();
        const importPath = path.join(configDir, 'v1-import.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            importPath,
            JSON.stringify({
                lines: [[
                    { id: '1', type: 'model' },
                    { id: '2', type: 'separator' },
                    { id: '3', type: 'git-branch' }
                ]],
                defaultSeparator: '|',
                flexMode: 'full-minus-40'
            }),
            'utf-8'
        );
        const current: Settings = { ...DEFAULT_SETTINGS, globalBold: true };

        const validation = await validateImportFile(importPath);

        expect(validation.status).toBe('valid');
        if (validation.status !== 'valid') {
            return;
        }
        // The v1 migration still runs (it drops separators a default separator replaces)
        expect(validation.data.lines[0]?.map(item => item.type)).toEqual(['model', 'git-branch']);
        expect(validation.presentKeys).toEqual(['lines', 'defaultSeparator', 'flexMode']);
        const merged = applyImport(current, validation.data, 'merge', validation.presentKeys);
        expect(merged.flexMode).toBe('full-minus-40');
        expect(merged.defaultSeparator).toBe('|');
        expect(merged.globalBold).toBe(true);
        expect(merged.updatemessage).toBeUndefined();
    });

    it('keeps current settings a v1 import holds values the migration drops for', async () => {
        const { configDir } = getSettingsPaths();
        const importPath = path.join(configDir, 'v1-import-invalid-fields.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            importPath,
            JSON.stringify({
                lines: 'not a list',
                flexMode: null,
                compactThreshold: 'high',
                defaultSeparator: '|'
            }),
            'utf-8'
        );
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            lines: [[{ id: 'mine', type: 'git-branch' }]],
            flexMode: 'full-minus-40',
            compactThreshold: 80
        };

        const validation = await validateImportFile(importPath);

        expect(validation.status).toBe('valid');
        if (validation.status !== 'valid') {
            return;
        }
        expect(validation.presentKeys).toEqual(['defaultSeparator']);
        const merged = applyImport(current, validation.data, 'merge', validation.presentKeys);
        expect(merged.lines).toEqual(current.lines);
        expect(merged.flexMode).toBe('full-minus-40');
        expect(merged.compactThreshold).toBe(80);
        expect(merged.defaultSeparator).toBe('|');
    });

    it('preserves local installation metadata during a replace import', () => {
        const installation: InstallationMetadata = {
            method: 'pinned',
            installedVersion: '2.2.26'
        };
        const current = { ...DEFAULT_SETTINGS, installation };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            globalBold: true,
            installation: {
                method: 'auto-update',
                packageManager: 'npm'
            }
        };

        const replaced = applyImport(current, imported, 'replace');

        expect(replaced.globalBold).toBe(true);
        expect(replaced.installation).toEqual(installation);
    });

    it('uses defaults in memory and preserves invalid JSON without overwriting', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, '{ invalid json', 'utf-8');

        const settings = await loadSettings();

        // Defaults are returned in memory.
        expect(settings.version).toBe(CURRENT_VERSION);

        // The invalid file is left exactly as the user wrote it (not overwritten).
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ invalid json');

        // No backup is created: recovery is non-destructive, so the original is the backup.
        expect(fs.existsSync(backupPath)).toBe(false);

        // A diagnostic is still emitted.
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to parse settings.json')
        );
    });

    it('uses defaults in memory and preserves an invalid v1 payload', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        const original = JSON.stringify({ flexMode: 123 });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.existsSync(backupPath)).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Invalid v1 settings format'),
            expect.anything()
        );
    });

    it('uses defaults in memory when schema validation fails', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // Has a version (skips v1 branch), version === CURRENT_VERSION (no migration),
        // but `lines: 42` is not an array, so SettingsSchema validation fails.
        const original = JSON.stringify({ version: CURRENT_VERSION, lines: 42 });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.existsSync(backupPath)).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to parse settings, using defaults'),
            expect.anything()
        );
    });

    it.each([
        { name: 'a string', version: '4' },
        { name: 'null', version: null }
    ])('uses defaults in memory and preserves a file whose version is $name', async ({ version }) => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // A version that isn't a number must not be read as a v1 config: the v1 migration
        // rebuilds the file from lines and v1 fields, dropping powerline and the rest.
        const original = JSON.stringify({
            version,
            lines: [[{ id: 'widget-1', type: 'model' }]],
            powerline: { enabled: true },
            minimalistMode: true
        });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.existsSync(backupPath)).toBe(false);
        expect(getConfigLoadError()).toBe('settings.json is not in a valid format');
    });

    it('loads a file without a version as the current version when it holds settings added after v1', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // Powerline and the git cache TTL came after v1, so this is a current config
        // that leaves the version out, not a v1 file to migrate.
        const original = JSON.stringify({
            lines: [[{ id: 'widget-1', type: 'model' }]],
            powerline: { enabled: true, theme: 'nord' },
            gitCacheTtlSeconds: 30
        });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(settings.lines).toEqual([[{ id: 'widget-1', type: 'model' }]]);
        expect(settings.powerline.enabled).toBe(true);
        expect(settings.powerline.theme).toBe('nord');
        expect(settings.gitCacheTtlSeconds).toBe(30);
        expect(settings.updatemessage).toBeUndefined();
        expect(getConfigLoadError()).toBeNull();
        // Not rewritten just to add a version, and nothing written beside it.
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.readdirSync(configDir)).toEqual(['settings.json']);
    });

    it('uses defaults in memory and preserves a file without a version whose later settings are invalid', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        const original = JSON.stringify({
            lines: [[{ id: 'widget-1', type: 'model' }]],
            powerline: { enabled: true },
            gitCacheTtlSeconds: 'often'
        });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(settings.powerline.enabled).toBe(false);
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.readdirSync(configDir)).toEqual(['settings.json']);
        expect(getConfigLoadError()).toBe('settings.json is not in a valid format');
    });

    it('migrates a v1 file and keeps the original beside it', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        const original = JSON.stringify({
            lines: [[
                { id: '1', type: 'model' },
                { id: '2', type: 'separator' },
                { id: '3', type: 'git-branch' }
            ]],
            flexMode: 'full-minus-40',
            defaultSeparator: '|'
        });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(settings.flexMode).toBe('full-minus-40');
        expect(settings.lines[0]?.map(item => item.type)).toEqual(['model', 'git-branch']);
        expect(settings.updatemessage?.message).toContain('v2.0.2');
        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(`${settingsPath}.v1.bak`, 'utf-8')).toBe(original);
    });

    it('keeps the original of an older versioned file beside it when migrating', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        const original = JSON.stringify({
            version: 2,
            lines: [[{ id: 'widget-1', type: 'model' }]]
        });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        await loadSettings();

        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(`${settingsPath}.v2.bak`, 'utf-8')).toBe(original);
    });

    // An editor saving in a legacy encoding leaves bytes that aren't UTF-8; JSON.parse
    // still takes the decoded text, so only a byte copy keeps the original intact
    it('keeps the original bytes in the backup, even ones that are not UTF-8', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        const original = Buffer.concat([
            Buffer.from('{"version":2,"lines":[[{"id":"1","type":"custom-text","customText":"caf'),
            Buffer.from([0xe9]),
            Buffer.from('"}]]}')
        ]);
        fs.writeFileSync(settingsPath, original);

        await loadSettings();

        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(`${settingsPath}.v2.bak`).equals(original)).toBe(true);
    });

    // Custom commands can carry credentials, so the copy a migration keeps must
    // stay as private as the file it came from
    it.skipIf(process.platform === 'win32')('gives a migration backup the permissions of a private settings file', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ version: 3, lines: [[{ id: 'widget-1', type: 'model' }]] }), 'utf-8');
        fs.chmodSync(settingsPath, 0o600);
        // A backup left from before keeps its own permissions when overwritten
        fs.writeFileSync(`${settingsPath}.v3.bak`, '{}', 'utf-8');
        fs.chmodSync(`${settingsPath}.v3.bak`, 0o644);

        await loadSettings();

        expect(fs.statSync(`${settingsPath}.v3.bak`).mode & 0o777).toBe(0o600);
    });

    it('uses the migration in memory and leaves the file untouched when its backup cannot be written', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        const { original, backupPath } = writeV2SettingsWithBlockedBackup();

        const settings = await loadSettings();

        // The user's settings, migrated: v4 turned the hide flag into a hide list
        expect(settings.version).toBe(CURRENT_VERSION);
        expect(settings.lines).toEqual([[{ id: 'widget-1', type: 'git-branch', metadata: { hide: 'no-git' } }]]);
        expect(settings.flexMode).toBe('full-minus-40');
        // The update message the migration adds waits until it's written, since
        // counting it down rewrites the file
        expect(settings.updatemessage).toBeUndefined();
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.readdirSync(backupPath)).toEqual([]);
        expect(fs.readdirSync(configDir).sort()).toEqual(['settings.json', 'settings.json.v2.bak']);
        // Not a load error, as the file is valid, and nothing on stderr, which every
        // status line render would repeat
        expect(getConfigLoadError()).toBeNull();
        expect(getConfigLoadNotice()).toBe('settings.json could not be backed up before migrating');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('writes the backup and the migration on a later load once the backup can be written', async () => {
        const { settingsPath } = getSettingsPaths();
        const { original, backupPath } = writeV2SettingsWithBlockedBackup();
        // The default is 'full', so this run got the user's settings
        expect((await loadSettings()).flexMode).toBe('full-minus-40');
        fs.rmdirSync(backupPath);

        const settings = await loadSettings();

        expect(settings.updatemessage?.message).toContain('v2.0.2');
        expect(fs.readFileSync(backupPath, 'utf-8')).toBe(original);
        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(getConfigLoadNotice()).toBeNull();
    });

    it('backs up the original before a save replaces a migration held in memory', async () => {
        const { settingsPath } = getSettingsPaths();
        const { original, backupPath } = writeV2SettingsWithBlockedBackup();
        const settings = await loadSettings();
        fs.rmdirSync(backupPath);

        await saveSettings({ ...settings, globalBold: true });

        expect(fs.readFileSync(backupPath, 'utf-8')).toBe(original);
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            version?: number;
            flexMode?: string;
            globalBold?: boolean;
        };
        expect(saved.version).toBe(CURRENT_VERSION);
        expect(saved.flexMode).toBe('full-minus-40');
        expect(saved.globalBold).toBe(true);
        expect(getConfigLoadNotice()).toBeNull();
    });

    it('backs up the file as it is now when it was edited while its migration was held in memory', async () => {
        const { settingsPath } = getSettingsPaths();
        const { backupPath } = writeV2SettingsWithBlockedBackup();
        const settings = await loadSettings();
        // Replaced in place by a config of another older version
        const edited = JSON.stringify({
            version: 3,
            lines: [[{ id: 'widget-1', type: 'model' }]],
            flexMode: 'full-until-compact'
        });
        fs.writeFileSync(settingsPath, edited, 'utf-8');
        fs.rmdirSync(backupPath);

        await saveSettings({ ...settings, globalBold: true });

        expect(fs.readFileSync(`${settingsPath}.v3.bak`, 'utf-8')).toBe(edited);
        expect(fs.existsSync(backupPath)).toBe(false);
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number; globalBold?: boolean };
        expect(saved.version).toBe(CURRENT_VERSION);
        expect(saved.globalBold).toBe(true);
    });

    it('keeps the backup another run made when it migrated the file while a migration was held in memory', async () => {
        const { settingsPath } = getSettingsPaths();
        const { backupPath } = writeV2SettingsWithBlockedBackup();
        const settings = await loadSettings();
        // Edited in place, then backed up and migrated by another run (such as a status
        // line render) once the backup could be written
        const editedLines = [[{ id: 'widget-1', type: 'model' }]];
        const edited = JSON.stringify({ version: 2, lines: editedLines, flexMode: 'full-until-compact' });
        fs.rmdirSync(backupPath);
        fs.writeFileSync(backupPath, edited, 'utf-8');
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({ version: CURRENT_VERSION, lines: editedLines, flexMode: 'full-until-compact' }),
            'utf-8'
        );

        await saveSettings({ ...settings, globalBold: true });

        expect(fs.readFileSync(backupPath, 'utf-8')).toBe(edited);
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number; globalBold?: boolean };
        expect(saved.version).toBe(CURRENT_VERSION);
        expect(saved.globalBold).toBe(true);
        expect(getConfigLoadNotice()).toBeNull();
    });

    it('refuses to save over a migration held in memory while its backup still cannot be written', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        const { original } = writeV2SettingsWithBlockedBackup();
        const settings = await loadSettings();

        await expect(saveSettings({ ...settings, globalBold: true })).rejects.toThrow();

        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.readdirSync(configDir).filter(name => name.endsWith('.tmp'))).toEqual([]);
        expect(getConfigLoadNotice()).toBe('settings.json could not be backed up before migrating');
    });

    it('does not record installation metadata over a migration it cannot back up', async () => {
        const { settingsPath } = getSettingsPaths();
        const { original } = writeV2SettingsWithBlockedBackup();

        await saveInstallationMetadata({ method: 'pinned' });

        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
    });

    it('keeps the migration backup beside a symlinked settings file', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        const targetDir = path.join(MOCK_HOME_DIR, 'dotfiles', 'ccstatusline');
        const targetPath = path.join(targetDir, 'settings.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(targetDir, { recursive: true });
        const original = JSON.stringify({
            version: 2,
            lines: [[{ id: 'widget-1', type: 'model' }]]
        });
        fs.writeFileSync(targetPath, original, 'utf-8');
        fs.symlinkSync(targetPath, settingsPath);

        await loadSettings();

        expect(fs.lstatSync(settingsPath).isSymbolicLink()).toBe(true);
        const migrated = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as { version?: number };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(fs.readFileSync(`${settingsPath}.v2.bak`, 'utf-8')).toBe(original);
        expect(fs.readdirSync(targetDir)).toEqual(['settings.json']);
    });

    it('uses defaults in memory when the settings file cannot be read', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // Make settings.json a directory so readFile throws (EISDIR) -> outer catch path.
        fs.mkdirSync(settingsPath, { recursive: true });

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        // The path is left as-is (still a directory) — nothing was written over it.
        expect(fs.statSync(settingsPath).isDirectory()).toBe(true);
        expect(fs.existsSync(backupPath)).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Error loading settings'),
            expect.anything()
        );
    });

    it('migrates older versioned settings and persists migrated result', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({
                version: 2,
                lines: [[{ id: 'widget-1', type: 'model' }]]
            }),
            'utf-8'
        );

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            version?: number;
            updatemessage?: { message?: string };
        };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(migrated.updatemessage?.message).toContain('v2.0.2');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('does not overwrite the file when a migration produces an invalid result', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // A v2 config whose migrated v3 form fails schema validation: the v2->v3 migration
        // copies fields through, so `lines: 42` survives into the v3 result and fails the schema.
        const original = JSON.stringify({ version: 2, lines: 42 });
        fs.writeFileSync(settingsPath, original, 'utf-8');

        const settings = await loadSettings();

        // Falls back to defaults in memory.
        expect(settings.version).toBe(CURRENT_VERSION);
        // The original file is preserved — the invalid migration was NOT written over it.
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        // No backup, and no temp residue from an aborted write.
        expect(fs.existsSync(backupPath)).toBe(false);
        expect(fs.readdirSync(configDir).filter(name => name.endsWith('.tmp'))).toEqual([]);
        // The failure is recorded so the statusline can warn.
        expect(getConfigLoadError()).not.toBeNull();
    });

    it('does not overwrite an unreadable settings.json when recording installation metadata', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        const original = '{ invalid json';
        fs.writeFileSync(settingsPath, original, 'utf-8');

        await saveInstallationMetadata({ method: 'pinned' });

        // The unreadable file is preserved, not overwritten with defaults+metadata.
        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original);
        expect(fs.existsSync(backupPath)).toBe(false);
    });

    it('records installation metadata when settings.json is valid', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({ version: CURRENT_VERSION, lines: [[], [], []] }),
            'utf-8'
        );

        await saveInstallationMetadata({ method: 'pinned' });

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { installation?: { method?: string } };
        expect(saved.installation?.method).toBe('pinned');
    });

    it('always saves current version in saveSettings', async () => {
        const { settingsPath } = getSettingsPaths();

        await saveSettings({
            ...DEFAULT_SETTINGS,
            version: 1
        });

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(saved.version).toBe(CURRENT_VERSION);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('saves settings without leaving a temp file behind', async () => {
        const { settingsPath, configDir } = getSettingsPaths();

        await saveSettings({ ...DEFAULT_SETTINGS });

        // Final file is complete and valid.
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(saved.version).toBe(CURRENT_VERSION);

        // No temporary write-file is left in the config directory.
        const leftovers = fs.readdirSync(configDir).filter(name => name.endsWith('.tmp'));
        expect(leftovers).toEqual([]);
    });

    // Custom commands can carry credentials, so a save must not open up a
    // settings file the user made private
    it.skipIf(process.platform === 'win32')('keeps a private settings file private when saving', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ version: CURRENT_VERSION, lines: [[], [], []] }), 'utf-8');
        fs.chmodSync(settingsPath, 0o600);

        await saveSettings({ ...DEFAULT_SETTINGS });

        expect(fs.statSync(settingsPath).mode & 0o777).toBe(0o600);
    });

    it('saves through a symlinked settings file without replacing the link', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        const targetDir = path.join(MOCK_HOME_DIR, 'dotfiles', 'ccstatusline');
        const targetPath = path.join(targetDir, 'settings.json');
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(
            targetPath,
            JSON.stringify({ version: CURRENT_VERSION, lines: [[], [], []], flexMode: 'full' }),
            'utf-8'
        );
        fs.symlinkSync(targetPath, settingsPath);

        await saveSettings({
            ...DEFAULT_SETTINGS,
            flexMode: 'full-minus-40'
        });

        expect(fs.lstatSync(settingsPath).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(settingsPath)).toBe(fs.realpathSync(targetPath));

        const saved = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as {
            flexMode?: string;
            version?: number;
        };
        expect(saved.version).toBe(CURRENT_VERSION);
        expect(saved.flexMode).toBe('full-minus-40');
        expect(fs.readdirSync(configDir).filter(name => name.endsWith('.tmp'))).toEqual([]);
        expect(fs.readdirSync(targetDir).filter(name => name.endsWith('.tmp'))).toEqual([]);
    });

    it('migration write-back leaves no temp file behind', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({
                version: 2,
                lines: [[{ id: 'widget-1', type: 'model' }]]
            }),
            'utf-8'
        );

        await loadSettings();

        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(migrated.version).toBe(CURRENT_VERSION);
        const leftovers = fs.readdirSync(configDir).filter(name => name.endsWith('.tmp'));
        expect(leftovers).toEqual([]);
    });

    it('cleans up the temp file and rethrows when the write cannot be renamed into place', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // Make the target a directory so the final rename always fails, exercising
        // the cleanup-on-error path in writeSettingsJson.
        fs.mkdirSync(settingsPath, { recursive: true });

        await expect(saveSettings({ ...DEFAULT_SETTINGS })).rejects.toThrow();

        // The target is untouched and no temp file is left behind.
        expect(fs.statSync(settingsPath).isDirectory()).toBe(true);
        const leftovers = fs.readdirSync(configDir).filter(name => name.endsWith('.tmp'));
        expect(leftovers).toEqual([]);
    });

    it('sets getConfigLoadError when settings.json contains invalid JSON', async () => {
        const { configDir, settingsPath } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, '{ bad json', 'utf-8');

        await loadSettings();

        const err = getConfigLoadError();
        expect(err).not.toBeNull();
        expect(err).toContain('settings.json');
    });

    it('sets getConfigLoadError when settings.json has invalid schema', async () => {
        const { configDir, settingsPath } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ version: CURRENT_VERSION, lines: 42 }), 'utf-8');

        await loadSettings();

        expect(getConfigLoadError()).not.toBeNull();
    });

    it('clears getConfigLoadError after loading a valid current-version config', async () => {
        const { configDir, settingsPath } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        // Write a valid config so we don't go through first-run path
        fs.writeFileSync(settingsPath, JSON.stringify({ version: CURRENT_VERSION, lines: [[], [], []] }), 'utf-8');

        await loadSettings();

        expect(getConfigLoadError()).toBeNull();
    });

    it('leaves getConfigLoadError null on first-run (no file)', async () => {
        // No file written — loadSettings triggers writeDefaultSettings
        await loadSettings();

        expect(getConfigLoadError()).toBeNull();
    });

    it('silently rewrites legacy git-pr widget type to git-review on load', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({
                version: CURRENT_VERSION,
                lines: [
                    [
                        { id: 'widget-1', type: 'model' },
                        { id: 'widget-2', type: 'git-pr' }
                    ],
                    [],
                    []
                ]
            }),
            'utf-8'
        );

        const settings = await loadSettings();

        // In-memory rewrite: legacy string is gone.
        const types = settings.lines[0]?.map(item => item.type);
        expect(types).toEqual(['model', 'git-review']);

        // Load does not eagerly persist; the rewrite lands on next save.
        const onDiskBeforeSave = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { lines: { type: string }[][] };
        expect(onDiskBeforeSave.lines[0]?.[1]?.type).toBe('git-pr');

        await saveSettings(settings);

        const onDiskAfterSave = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { lines: { type: string }[][] };
        expect(onDiskAfterSave.lines[0]?.[1]?.type).toBe('git-review');
    });
});
