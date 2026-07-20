import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    SettingsSchema
} from '../../types/Settings';
import { getClaudeSettingsPath } from '../claude-settings';
import {
    removeManagedHooks,
    syncWidgetHooks
} from '../hooks';

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';

function getLocalClaudeSettingsPath(): string {
    return path.join(testClaudeConfigDir, 'settings.json');
}

describe('syncWidgetHooks', () => {
    beforeEach(() => {
        testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hooks-'));
        process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
    });

    afterEach(() => {
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

    it('removes managed hooks and persists cleanup when status line is unset', async () => {
        const settingsPath = getLocalClaudeSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify({
            hooks: {
                PreToolUse: [
                    {
                        _tag: 'ccstatusline-managed',
                        matcher: 'Skill',
                        hooks: [{ type: 'command', command: 'old-command --hook' }]
                    },
                    {
                        matcher: 'Other',
                        hooks: [{ type: 'command', command: 'keep-command' }]
                    }
                ],
                UserPromptSubmit: [
                    {
                        _tag: 'ccstatusline-managed',
                        hooks: [{ type: 'command', command: 'old-command --hook' }]
                    }
                ]
            }
        }, null, 2), 'utf-8');

        await syncWidgetHooks(DEFAULT_SETTINGS);

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks).toEqual({
            PreToolUse: [
                {
                    matcher: 'Other',
                    hooks: [{ type: 'command', command: 'keep-command' }]
                }
            ]
        });
    });

    it('heals legacy untagged ccstatusline hooks instead of leaving duplicates', async () => {
        const settingsPath = getLocalClaudeSettingsPath();
        const command = '/Users/test/.bun/bin/ccstatusline';
        fs.writeFileSync(settingsPath, JSON.stringify({
            statusLine: { type: 'command', command },
            hooks: {
                PreToolUse: [
                    {
                        matcher: 'Skill',
                        hooks: [{ type: 'command', command: 'bunx -y ccstatusline@latest --hook' }]
                    },
                    {
                        matcher: 'Other',
                        hooks: [{ type: 'command', command: 'keep-command' }]
                    }
                ],
                UserPromptSubmit: [
                    { hooks: [{ type: 'command', command: 'bunx -y ccstatusline@latest --hook' }] }
                ]
            }
        }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        await syncWidgetHooks(settings);

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks).toEqual({
            PreToolUse: [
                {
                    matcher: 'Other',
                    hooks: [{ type: 'command', command: 'keep-command' }]
                },
                {
                    _tag: 'ccstatusline-managed',
                    matcher: 'Skill',
                    hooks: [{ type: 'command', command: `${command} --hook` }]
                }
            ],
            UserPromptSubmit: [
                {
                    _tag: 'ccstatusline-managed',
                    hooks: [{ type: 'command', command: `${command} --hook` }]
                }
            ]
        });
    });

    it('preserves other commands in mixed legacy hook entries while syncing', async () => {
        const settingsPath = getLocalClaudeSettingsPath();
        const command = '/Users/test/.bun/bin/ccstatusline';
        fs.writeFileSync(settingsPath, JSON.stringify({
            statusLine: { type: 'command', command },
            hooks: {
                PreToolUse: [
                    {
                        matcher: 'Skill',
                        hooks: [
                            { type: 'command', command: 'npx ccstatusline --hook' },
                            { type: 'command', command: 'keep-command' }
                        ]
                    }
                ]
            }
        }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        await syncWidgetHooks(settings);

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks).toEqual({
            PreToolUse: [
                {
                    matcher: 'Skill',
                    hooks: [{ type: 'command', command: 'keep-command' }]
                },
                {
                    _tag: 'ccstatusline-managed',
                    matcher: 'Skill',
                    hooks: [{ type: 'command', command: `${command} --hook` }]
                }
            ],
            UserPromptSubmit: [
                {
                    _tag: 'ccstatusline-managed',
                    hooks: [{ type: 'command', command: `${command} --hook` }]
                }
            ]
        });
    });

    it('preserves other commands in mixed legacy hook entries while removing managed hooks', async () => {
        const settingsPath = getLocalClaudeSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify({
            hooks: {
                PreToolUse: [
                    {
                        matcher: 'Skill',
                        hooks: [
                            { type: 'command', command: 'bunx -y ccstatusline@latest --hook' },
                            { type: 'command', command: 'keep-command' }
                        ]
                    },
                    {
                        matcher: 'LegacyOnly',
                        hooks: [{ type: 'command', command: 'npx ccstatusline --hook' }]
                    },
                    {
                        _tag: 'ccstatusline-managed',
                        matcher: 'Managed',
                        hooks: [{ type: 'command', command: '/Users/test/.bun/bin/ccstatusline --hook' }]
                    }
                ]
            }
        }, null, 2), 'utf-8');

        await removeManagedHooks();

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks).toEqual({
            PreToolUse: [
                {
                    matcher: 'Skill',
                    hooks: [{ type: 'command', command: 'keep-command' }]
                }
            ]
        });
    });

    it('is idempotent — repeated syncs heal legacy hooks without accumulating', async () => {
        const settingsPath = getLocalClaudeSettingsPath();
        const command = '/Users/test/.bun/bin/ccstatusline';
        // Seed a legacy untagged hook so the first sync exercises the heal (regex) path,
        // not just the tagged-entry path.
        fs.writeFileSync(settingsPath, JSON.stringify({
            statusLine: { type: 'command', command },
            hooks: {
                PreToolUse: [
                    {
                        matcher: 'Skill',
                        hooks: [{ type: 'command', command: 'npx ccstatusline --hook' }]
                    }
                ]
            }
        }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        await syncWidgetHooks(settings);
        const afterFirst = fs.readFileSync(settingsPath, 'utf-8');

        await syncWidgetHooks(settings);
        const afterSecond = fs.readFileSync(settingsPath, 'utf-8');

        expect(afterSecond).toEqual(afterFirst);

        const saved = JSON.parse(afterSecond) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks?.PreToolUse).toHaveLength(1);
        expect(saved.hooks?.UserPromptSubmit).toHaveLength(1);
    });
});

describe('hooks target routing', () => {
    let previousConfigDir: string | undefined;
    let claudeDir = '';
    let targetDir = '';
    let targetPath = '';

    beforeEach(() => {
        claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hooks-claude-'));
        previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = claudeDir;
        targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hooks-target-'));
        targetPath = path.join(targetDir, 'settings.local.json');
    });

    afterEach(() => {
        if (previousConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
        }
        fs.rmSync(claudeDir, { recursive: true, force: true });
        fs.rmSync(targetDir, { recursive: true, force: true });
    });

    it('removeManagedHooks strips tagged entries from the explicit target only', async () => {
        const tagged = {
            hooks: {
                PostToolUse: [{
                    _tag: 'ccstatusline-managed',
                    hooks: [{ type: 'command', command: 'bunx -y ccstatusline@latest --hook' }]
                }]
            },
            sandbox: { enabled: true }
        };
        fs.writeFileSync(targetPath, JSON.stringify(tagged), 'utf-8');
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify(tagged), 'utf-8');

        await removeManagedHooks({ targetPath });

        const target = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as { hooks?: unknown; sandbox?: unknown };
        expect(target.hooks).toBeUndefined();
        expect(target.sandbox).toEqual({ enabled: true });

        const globalFile = JSON.parse(fs.readFileSync(getClaudeSettingsPath(), 'utf-8')) as { hooks?: unknown };
        expect(globalFile.hooks).toBeDefined();
    });

    it('syncWidgetHooks with no hook widgets strips managed hooks in the explicit target only', async () => {
        const tagged = {
            statusLine: { type: 'command', command: 'bunx -y ccstatusline@latest', padding: 0 },
            hooks: {
                PostToolUse: [{
                    _tag: 'ccstatusline-managed',
                    hooks: [{ type: 'command', command: 'bunx -y ccstatusline@latest --hook' }]
                }]
            }
        };
        fs.writeFileSync(targetPath, JSON.stringify(tagged), 'utf-8');
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify(tagged), 'utf-8');

        await syncWidgetHooks(DEFAULT_SETTINGS, { targetPath });

        const target = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as { hooks?: unknown; statusLine?: unknown };
        expect(target.hooks).toBeUndefined();
        expect(target.statusLine).toBeDefined();

        const globalFile = JSON.parse(fs.readFileSync(getClaudeSettingsPath(), 'utf-8')) as { hooks?: unknown };
        expect(globalFile.hooks).toBeDefined();
    });

    it('syncWidgetHooks with no hook widgets and a nonexistent explicit target does not create the file', async () => {
        expect(fs.existsSync(targetPath)).toBe(false);

        await syncWidgetHooks(DEFAULT_SETTINGS, { targetPath });

        expect(fs.existsSync(targetPath)).toBe(false);
    });
});
