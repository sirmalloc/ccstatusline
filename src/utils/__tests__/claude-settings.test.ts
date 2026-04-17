import * as childProcess from 'child_process';
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
    getClaudeCodeVersion,
    getClaudeSettingsPath,
    getExistingStatusLine,
    getRefreshInterval,
    installStatusLine,
    isClaudeCodeVersionAtLeast,
    isInstalled,
    isKnownCommand,
    loadClaudeSettings,
    saveClaudeSettings,
    setRefreshInterval,
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

function readInstalledRefreshInterval(): number | undefined {
    const settingsPath = getClaudeSettingsPath();
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const data = JSON.parse(content) as { statusLine?: { refreshInterval?: number } };
    return data.statusLine?.refreshInterval;
}

function writeRawClaudeSettings(content: string): void {
    const settingsPath = getClaudeSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, content, 'utf-8');
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

    it('should match command containing ccstatusline.ts', () => {
        expect(isKnownCommand('bun run /home/user/ccstatusline/src/ccstatusline.ts')).toBe(true);
    });

    it('should match command containing a quoted ccstatusline.ts path', () => {
        expect(isKnownCommand('bun run "/Users/Jane Doe/ccstatusline/src/ccstatusline.ts"')).toBe(true);
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

describe('installStatusLine refreshInterval', () => {
    it('should set refreshInterval to 10 when version is supported', async () => {
        initConfigPath();
        await installStatusLine(false, true);
        expect(readInstalledRefreshInterval()).toBe(10);
    });

    it('should not set refreshInterval when version is unsupported', async () => {
        initConfigPath();
        await installStatusLine(false, false);
        expect(readInstalledRefreshInterval()).toBeUndefined();
    });

    it('should preserve existing refreshInterval on re-install', async () => {
        writeRawClaudeSettings(JSON.stringify({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0,
                refreshInterval: 5
            }
        }));
        await installStatusLine(false, true);
        expect(readInstalledRefreshInterval()).toBe(5);
    });
});

describe('refreshInterval', () => {
    it('getRefreshInterval should return null when no settings exist', async () => {
        await expect(getRefreshInterval()).resolves.toBeNull();
    });

    it('getRefreshInterval should return null when statusLine has no refreshInterval', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            }
        });
        await expect(getRefreshInterval()).resolves.toBeNull();
    });

    it('getRefreshInterval should return the configured value', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0,
                refreshInterval: 5
            }
        });
        await expect(getRefreshInterval()).resolves.toBe(5);
    });

    it('setRefreshInterval should set the value on existing statusLine', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            }
        });

        await setRefreshInterval(15);

        const settings = await loadClaudeSettings();
        expect(settings.statusLine?.refreshInterval).toBe(15);
    });

    it('setRefreshInterval with null should remove refreshInterval', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0,
                refreshInterval: 10
            }
        });

        await setRefreshInterval(null);

        const settings = await loadClaudeSettings();
        expect(settings.statusLine?.refreshInterval).toBeUndefined();
    });

    it('setRefreshInterval should do nothing when no statusLine exists', async () => {
        await saveClaudeSettings({});

        await setRefreshInterval(10);

        const settings = await loadClaudeSettings();
        expect(settings.statusLine).toBeUndefined();
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

    it('isInstalled should accept quoted local development commands when padding is undefined', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: 'bun run "/Users/Jane Doe/ccstatusline/src/ccstatusline.ts"'
            }
        });

        await expect(isInstalled()).resolves.toBe(true);
    });
});

describe('getClaudeCodeVersion', () => {
    it('should parse version from claude --version output', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('2.1.97 (Claude Code)\n');
        expect(getClaudeCodeVersion()).toBe('2.1.97');
    });

    it('should parse version without suffix text', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('3.0.0\n');
        expect(getClaudeCodeVersion()).toBe('3.0.0');
    });

    it('should return null when claude is not installed', () => {
        vi.spyOn(childProcess, 'execSync').mockImplementation(() => { throw new Error('not found'); });
        expect(getClaudeCodeVersion()).toBeNull();
    });

    it('should return null for unexpected output', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('unknown output');
        expect(getClaudeCodeVersion()).toBeNull();
    });
});

describe('isClaudeCodeVersionAtLeast', () => {
    it('should return true when version equals minimum', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('2.1.97 (Claude Code)\n');
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(true);
    });

    it('should return true when patch is higher', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('2.1.100 (Claude Code)\n');
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(true);
    });

    it('should return true when minor is higher', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('2.2.0 (Claude Code)\n');
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(true);
    });

    it('should return true when major is higher', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('3.0.0 (Claude Code)\n');
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(true);
    });

    it('should return false when version is lower', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('2.1.96 (Claude Code)\n');
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(false);
    });

    it('should return false when minor is lower', () => {
        vi.spyOn(childProcess, 'execSync').mockReturnValue('2.0.100 (Claude Code)\n');
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(false);
    });

    it('should return false when claude is not installed', () => {
        vi.spyOn(childProcess, 'execSync').mockImplementation(() => { throw new Error('not found'); });
        expect(isClaudeCodeVersionAtLeast('2.1.97')).toBe(false);
    });
});