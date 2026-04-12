import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import {
    CCSTATUSLINE_COMMANDS,
    getActiveClaudeSettingsPath,
    getClaudeLocalSettingsPath,
    getClaudeSettingsPath,
    getExistingStatusLine,
    hasLocalSettings,
    installStatusLine,
    isInstalled,
    isKnownCommand,
    loadClaudeSettings,
    saveClaudeSettings,
    uninstallStatusLine
} from '../claude-settings';
import { initConfigPath } from '../config';

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';

function readInstalledCommand(): string {
    const settingsPath = getClaudeSettingsPath();
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const data = JSON.parse(content) as { statusLine?: { command?: string } };
    return data.statusLine?.command ?? '';
}

function writeRawClaudeSettings(content: string): void {
    const settingsPath = getClaudeSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, content, 'utf-8');
}

function writeLocalClaudeSettings(content: string): void {
    const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
    fs.writeFileSync(localPath, content, 'utf-8');
}

beforeEach(() => {
    testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-claude-settings-'));
    process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
    initConfigPath();
});

afterEach(() => {
    initConfigPath();
    if (testClaudeConfigDir) {
        fs.rmSync(testClaudeConfigDir, { recursive: true, force: true });
    }
});

afterAll(() => {
    if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
});

describe('isKnownCommand', () => {
    it('should match exact NPM command', () => {
        expect(isKnownCommand(CCSTATUSLINE_COMMANDS.NPM)).toBe(true);
    });

    it('should match exact BUNX command', () => {
        expect(isKnownCommand(CCSTATUSLINE_COMMANDS.BUNX)).toBe(true);
    });

    it('should match exact SELF_MANAGED command', () => {
        expect(isKnownCommand(CCSTATUSLINE_COMMANDS.SELF_MANAGED)).toBe(true);
    });

    it('should match NPM command with --config and simple path', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.NPM} --config /tmp/settings.json`)).toBe(true);
    });

    it('should match BUNX command with --config and quoted path with spaces', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.BUNX} --config '/my path/settings.json'`)).toBe(true);
    });

    it('should match command with --config and quoted path with parens', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my(path)/settings.json'`)).toBe(true);
    });

    it('should match command with --config and double-quoted Windows path', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.NPM} --config "C:\\Users\\Alice\\My Settings\\settings.json"`)).toBe(true);
    });

    it('should not match unknown commands', () => {
        expect(isKnownCommand('some-other-command')).toBe(false);
    });

    it('should not match empty string', () => {
        expect(isKnownCommand('')).toBe(false);
    });

    it('should not match partial prefix', () => {
        expect(isKnownCommand('npx -y ccstatusline')).toBe(false);
    });

    it('should not match prefix that is a substring', () => {
        expect(isKnownCommand('npx -y ccstatusline@latestFOO')).toBe(false);
    });
});

describe('local settings path helpers', () => {
    it('getClaudeLocalSettingsPath should return settings.local.json in config dir', () => {
        expect(getClaudeLocalSettingsPath()).toBe(
            path.join(testClaudeConfigDir, 'settings.local.json')
        );
    });

    it('hasLocalSettings should return false when file does not exist', () => {
        expect(hasLocalSettings()).toBe(false);
    });

    it('hasLocalSettings should return true when file exists', () => {
        fs.writeFileSync(
            path.join(testClaudeConfigDir, 'settings.local.json'),
            '{}',
            'utf-8'
        );
        expect(hasLocalSettings()).toBe(true);
    });
});

describe('buildCommand via installStatusLine', () => {
    it('should use base command when no custom config path', async () => {
        initConfigPath();
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(CCSTATUSLINE_COMMANDS.NPM);
    });

    it('should append --config with simple path (no quoting needed)', async () => {
        initConfigPath('/tmp/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config /tmp/settings.json`);
    });

    it('should quote path with spaces', async () => {
        initConfigPath('/my path/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my path/settings.json'`);
    });

    it('should quote path with parentheses', async () => {
        initConfigPath('/my(path)/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my(path)/settings.json'`);
    });

    it('should escape embedded single quotes in path', async () => {
        initConfigPath('/my\'path/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my'\\''path/settings.json'`);
    });

    it('should use bunx command when useBunx is true', async () => {
        initConfigPath('/my path/settings.json');
        await installStatusLine(true);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.BUNX} --config '/my path/settings.json'`);
    });

    it('should sync hooks on install when settings include hook-enabled widgets', async () => {
        const configPath = path.join(testClaudeConfigDir, 'ccstatusline-settings.json');
        initConfigPath(configPath);
        const settingsWithSkills = {
            ...DEFAULT_SETTINGS,
            lines: [[{ id: 'skills-1', type: 'skills' }], [], []]
        };
        fs.writeFileSync(configPath, JSON.stringify(settingsWithSkills, null, 2), 'utf-8');

        await installStatusLine(false);

        const installedCommand = `${CCSTATUSLINE_COMMANDS.NPM} --config ${configPath}`;
        const claudeSettings = await loadClaudeSettings();
        expect(claudeSettings.statusLine?.command).toBe(installedCommand);
        const hooks = (claudeSettings.hooks ?? {}) as Record<string, unknown[]>;
        expect(hooks.PreToolUse).toEqual([
            {
                _tag: 'ccstatusline-managed',
                matcher: 'Skill',
                hooks: [{ type: 'command', command: `${installedCommand} --hook` }]
            }
        ]);
        expect(hooks.UserPromptSubmit).toEqual([
            {
                _tag: 'ccstatusline-managed',
                hooks: [{ type: 'command', command: `${installedCommand} --hook` }]
            }
        ]);
    });
});

describe('backup and error handling behavior', () => {
    it('saveClaudeSettings should create .bak backup before overwrite', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: {
                type: 'command',
                command: 'preexisting-command',
                padding: 1
            }
        }));

        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            }
        });

        const settingsPath = getClaudeSettingsPath();
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { statusLine?: { command?: string } };
        expect(saved.statusLine?.command).toBe(CCSTATUSLINE_COMMANDS.NPM);
        expect(fs.existsSync(`${settingsPath}.bak`)).toBe(true);

        const backup = JSON.parse(fs.readFileSync(`${settingsPath}.bak`, 'utf-8')) as { statusLine?: { command?: string } };
        expect(backup.statusLine?.command).toBe('preexisting-command');
    });

    it('installStatusLine should create .orig backup before updating settings', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: {
                type: 'command',
                command: 'old-command',
                padding: 1
            }
        }));

        await installStatusLine(false);

        const settingsPath = getClaudeSettingsPath();
        expect(fs.existsSync(`${settingsPath}.orig`)).toBe(true);

        const orig = JSON.parse(fs.readFileSync(`${settingsPath}.orig`, 'utf-8')) as { statusLine?: { command?: string } };
        expect(orig.statusLine?.command).toBe('old-command');
    });

    it('loadClaudeSettings should return empty object when settings file is missing', async () => {
        await expect(loadClaudeSettings()).resolves.toEqual({});
    });

    it('loadClaudeSettings should log and throw when settings file is invalid JSON', async () => {
        writeRawClaudeSettings('{ invalid json');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await expect(loadClaudeSettings()).rejects.toThrow();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to load Claude settings:',
                expect.anything()
            );
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it('isInstalled should return false when settings cannot be loaded', async () => {
        writeRawClaudeSettings('{ invalid json');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await expect(isInstalled()).resolves.toBe(false);
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it('installStatusLine should warn and recover when existing settings are invalid', async () => {
        writeRawClaudeSettings('{ invalid json');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await installStatusLine(false);

            const settingsPath = getClaudeSettingsPath();
            const installed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { statusLine?: { command?: string; padding?: number } };
            expect(installed.statusLine?.command).toBe(CCSTATUSLINE_COMMANDS.NPM);
            expect(installed.statusLine?.padding).toBe(0);
            expect(fs.existsSync(`${settingsPath}.orig`)).toBe(true);
            expect(fs.readFileSync(`${settingsPath}.orig`, 'utf-8')).toBe('{ invalid json');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                `Warning: Could not read existing Claude settings. A backup exists at ${settingsPath}.orig.`
            );
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it('uninstallStatusLine should warn and return without modifying invalid settings', async () => {
        writeRawClaudeSettings('{ invalid json');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await uninstallStatusLine();

            const settingsPath = getClaudeSettingsPath();
            expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ invalid json');
            expect(fs.existsSync(`${settingsPath}.bak`)).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Warning: Could not read existing Claude settings.'
            );
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it('uninstallStatusLine should remove all managed hooks', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            },
            hooks: {
                PreToolUse: [
                    {
                        _tag: 'ccstatusline-managed',
                        matcher: 'Skill',
                        hooks: [{ type: 'command', command: `${CCSTATUSLINE_COMMANDS.NPM} --hook` }]
                    },
                    {
                        matcher: 'Other',
                        hooks: [{ type: 'command', command: 'keep-me' }]
                    }
                ],
                UserPromptSubmit: [
                    {
                        _tag: 'ccstatusline-managed',
                        hooks: [{ type: 'command', command: `${CCSTATUSLINE_COMMANDS.NPM} --hook` }]
                    }
                ]
            }
        }));

        await uninstallStatusLine();

        const settingsPath = getClaudeSettingsPath();
        const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            statusLine?: unknown;
            hooks?: Record<string, unknown[]>;
        };
        expect(updated.statusLine).toBeUndefined();
        expect(updated.hooks).toEqual({
            PreToolUse: [
                {
                    matcher: 'Other',
                    hooks: [{ type: 'command', command: 'keep-me' }]
                }
            ]
        });
    });

    it('getExistingStatusLine should return null when settings cannot be loaded', async () => {
        writeRawClaudeSettings('{ invalid json');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await expect(getExistingStatusLine()).resolves.toBeNull();
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it('isInstalled should accept known commands with --config and undefined padding', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: `${CCSTATUSLINE_COMMANDS.NPM} --config /tmp/settings.json`
            }
        });

        await expect(isInstalled()).resolves.toBe(true);
    });
});

describe('file-path-aware load/save', () => {
    it('loadClaudeSettings should load from specified filePath', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        fs.writeFileSync(localPath, JSON.stringify({
            statusLine: { type: 'command', command: 'local-command', padding: 0 }
        }), 'utf-8');

        const settings = await loadClaudeSettings({ filePath: localPath });
        expect(settings.statusLine?.command).toBe('local-command');
    });

    it('loadClaudeSettings should return empty object when specified filePath does not exist', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        const settings = await loadClaudeSettings({ filePath: localPath });
        expect(settings).toEqual({});
    });

    it('saveClaudeSettings should save to specified filePath', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        await saveClaudeSettings({
            statusLine: { type: 'command', command: 'test-cmd', padding: 0 }
        }, localPath);

        const content = JSON.parse(fs.readFileSync(localPath, 'utf-8')) as { statusLine?: { command?: string } };
        expect(content.statusLine?.command).toBe('test-cmd');
    });

    it('saveClaudeSettings should create backup for specified filePath', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        fs.writeFileSync(localPath, JSON.stringify({ existing: true }), 'utf-8');

        await saveClaudeSettings({
            statusLine: { type: 'command', command: 'new-cmd', padding: 0 }
        }, localPath);

        expect(fs.existsSync(`${localPath}.bak`)).toBe(true);
        const backup = JSON.parse(fs.readFileSync(`${localPath}.bak`, 'utf-8')) as { existing?: boolean };
        expect(backup.existing).toBe(true);
    });
});

describe('dual-file detection', () => {
    it('isInstalled should detect installation in settings.local.json', async () => {
        writeLocalClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: CCSTATUSLINE_COMMANDS.NPM, padding: 0 }
        }));
        await expect(isInstalled()).resolves.toBe(true);
    });

    it('isInstalled should prefer local over global', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: CCSTATUSLINE_COMMANDS.NPM, padding: 0 }
        }));
        writeLocalClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: 'other-command', padding: 0 }
        }));
        // Local has non-ccstatusline command, so isInstalled should be false
        await expect(isInstalled()).resolves.toBe(false);
    });

    it('isInstalled should fall back to global when local has no statusLine', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: CCSTATUSLINE_COMMANDS.NPM, padding: 0 }
        }));
        writeLocalClaudeSettings(JSON.stringify({}));
        await expect(isInstalled()).resolves.toBe(true);
    });

    it('getExistingStatusLine should return command from local first', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: 'global-command' }
        }));
        writeLocalClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: 'local-command' }
        }));
        await expect(getExistingStatusLine()).resolves.toBe('local-command');
    });

    it('getExistingStatusLine should fall back to global', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: 'global-command' }
        }));
        await expect(getExistingStatusLine()).resolves.toBe('global-command');
    });

    it('getActiveClaudeSettingsPath should return local path when local has statusLine', () => {
        writeLocalClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: 'local-command' }
        }));
        expect(getActiveClaudeSettingsPath()).toBe(
            path.join(testClaudeConfigDir, 'settings.local.json')
        );
    });

    it('getActiveClaudeSettingsPath should return global path when local has no statusLine', () => {
        writeLocalClaudeSettings(JSON.stringify({}));
        expect(getActiveClaudeSettingsPath()).toBe(
            path.join(testClaudeConfigDir, 'settings.json')
        );
    });

    it('getActiveClaudeSettingsPath should return global path when no local file', () => {
        expect(getActiveClaudeSettingsPath()).toBe(
            path.join(testClaudeConfigDir, 'settings.json')
        );
    });

    it('should fall through to global when local file is malformed JSON', async () => {
        writeLocalClaudeSettings('{ invalid json');
        writeRawClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: CCSTATUSLINE_COMMANDS.NPM, padding: 0 }
        }));
        await expect(isInstalled()).resolves.toBe(true);
        await expect(getExistingStatusLine()).resolves.toBe(CCSTATUSLINE_COMMANDS.NPM);
    });

    it('should treat ccstatusline as inactive when local has a different statusLine', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: CCSTATUSLINE_COMMANDS.NPM, padding: 0 }
        }));
        writeLocalClaudeSettings(JSON.stringify({
            statusLine: { type: 'command', command: 'some-other-tool' }
        }));
        // Local wins — and local is not ccstatusline
        await expect(isInstalled()).resolves.toBe(false);
        // But getExistingStatusLine returns whatever is effective
        await expect(getExistingStatusLine()).resolves.toBe('some-other-tool');
    });
});

describe('file-targeted installStatusLine', () => {
    it('should install to settings.local.json when targetPath specified', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        await installStatusLine(false, localPath);

        const content = JSON.parse(fs.readFileSync(localPath, 'utf-8')) as { statusLine?: { command?: string } };
        expect(content.statusLine?.command).toBe(CCSTATUSLINE_COMMANDS.NPM);

        // settings.json should not have been created
        const globalPath = getClaudeSettingsPath();
        expect(fs.existsSync(globalPath)).toBe(false);
    });

    it('should create .orig backup for targeted file', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        fs.writeFileSync(localPath, JSON.stringify({ existing: 'data' }), 'utf-8');

        await installStatusLine(false, localPath);

        expect(fs.existsSync(`${localPath}.orig`)).toBe(true);
        const orig = JSON.parse(fs.readFileSync(`${localPath}.orig`, 'utf-8')) as { existing?: string };
        expect(orig.existing).toBe('data');
    });

    it('should still install to settings.json by default', async () => {
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(CCSTATUSLINE_COMMANDS.NPM);
    });
});