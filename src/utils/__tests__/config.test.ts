import * as fs from 'fs';
import path from 'path';
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
    type Settings
} from '../../types/Settings';

const MOCK_HOME_DIR = '/tmp/ccstatusline-config-test-home';
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

let loadSettings: () => Promise<Settings>;
let saveSettings: (settings: Settings) => Promise<void>;
let initConfigPath: (filePath?: string) => void;
let getConfigLoadError: () => string | null;
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

describe('config utilities', () => {
    beforeAll(async () => {
        const configModule = await import('../config');
        loadSettings = configModule.loadSettings;
        saveSettings = configModule.saveSettings;
        initConfigPath = configModule.initConfigPath;
        getConfigLoadError = configModule.getConfigLoadError;
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
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Default settings written to')
        );
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
