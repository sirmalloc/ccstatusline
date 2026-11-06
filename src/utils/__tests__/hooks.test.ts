import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
import { buildStatusLineCommand } from '../claude-settings';
import {
    initConfigPath,
    saveSettings
} from '../config';
import {
    removeManagedHooks,
    syncWidgetHooks
} from '../hooks';

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';

function getClaudeSettingsPath(): string {
    return path.join(testClaudeConfigDir, 'settings.json');
}

describe('syncWidgetHooks', () => {
    beforeEach(() => {
        testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hooks-'));
        process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
        // Saves are of the default config, which a command without --config loads
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

    it('removes managed hooks and persists cleanup when status line is unset', async () => {
        const settingsPath = getClaudeSettingsPath();
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
        const settingsPath = getClaudeSettingsPath();
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
        const settingsPath = getClaudeSettingsPath();
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
        const settingsPath = getClaudeSettingsPath();
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

    it('only removes managed hooks when the status line command is another tool', async () => {
        const settingsPath = getClaudeSettingsPath();
        const command = 'bash ~/.claude/statusline.sh';
        fs.writeFileSync(settingsPath, JSON.stringify({
            statusLine: { type: 'command', command },
            hooks: {
                PreToolUse: [
                    {
                        _tag: 'ccstatusline-managed',
                        matcher: 'Skill',
                        hooks: [{ type: 'command', command: `${command} --hook` }]
                    },
                    {
                        matcher: 'Other',
                        hooks: [{ type: 'command', command: 'keep-command' }]
                    }
                ]
            }
        }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        const skipped = await syncWidgetHooks(settings);

        expect(skipped).toEqual({ statusCommand: command, widgetNames: ['Skills'] });
        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            statusLine?: { command?: string };
            hooks?: Record<string, unknown[]>;
        };
        expect(saved.statusLine?.command).toBe(command);
        expect(saved.hooks).toEqual({
            PreToolUse: [
                {
                    matcher: 'Other',
                    hooks: [{ type: 'command', command: 'keep-command' }]
                }
            ]
        });
    });

    it('reports no skipped hooks for another tool\'s command when no widget needs them', async () => {
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify({ statusLine: { type: 'command', command: 'bash ~/.claude/statusline.sh' } }, null, 2), 'utf-8');

        expect(await syncWidgetHooks(DEFAULT_SETTINGS)).toBeNull();
    });

    it('reports no skipped hooks when no status line is installed', async () => {
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify({}, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        expect(await syncWidgetHooks(settings)).toBeNull();
    });

    it('adds hooks for a ccstatusline command wrapped in a shell', async () => {
        const settingsPath = getClaudeSettingsPath();
        const command = 'bash -c \'head -1 | ccstatusline\'';
        fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command } }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        expect(await syncWidgetHooks(settings)).toBeNull();

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks).toEqual({
            PreToolUse: [
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

    it('leaves the hooks alone when saving a config the status line command doesn\'t load', async () => {
        const settingsPath = getClaudeSettingsPath();
        const command = 'npx -y ccstatusline@latest';
        const claudeSettings = JSON.stringify({
            statusLine: { type: 'command', command },
            hooks: {
                PreToolUse: [
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
            }
        }, null, 2);
        fs.writeFileSync(settingsPath, claudeSettings, 'utf-8');

        // The command loads the default config; this one was opened with --config
        initConfigPath(path.join(testClaudeConfigDir, 'other.json'));
        await syncWidgetHooks(DEFAULT_SETTINGS);

        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(claudeSettings);
    });

    it('doesn\'t add hooks for the default config when the status line command loads another', async () => {
        const settingsPath = getClaudeSettingsPath();
        const command = `ccstatusline --config ${path.join(testClaudeConfigDir, 'other.json')}`;
        const claudeSettings = JSON.stringify({ statusLine: { type: 'command', command } }, null, 2);
        fs.writeFileSync(settingsPath, claudeSettings, 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        await syncWidgetHooks(settings);

        expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(claudeSettings);
    });

    it('adds hooks once the saved config is the one the command\'s --config names', async () => {
        const settingsPath = getClaudeSettingsPath();
        const command = 'ccstatusline --config ~/\'my configs\'/statusline.json';
        fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command } }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

        await syncWidgetHooks(settings);
        const unchanged = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(unchanged.hooks).toBeUndefined();

        initConfigPath(path.join(os.homedir(), 'my configs', 'statusline.json'));
        await syncWidgetHooks(settings);

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks).toEqual({
            PreToolUse: [
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

    it.each(['installed alias', 'edited alias', 'two aliases'])('syncs hooks when the config uses a symlink: %s', async (scenario) => {
        const target = path.join(testClaudeConfigDir, 'target.json');
        const alias = path.join(testClaudeConfigDir, 'alias.json');
        const otherAlias = path.join(testClaudeConfigDir, 'other-alias.json');
        fs.writeFileSync(target, JSON.stringify(DEFAULT_SETTINGS));
        fs.symlinkSync(target, alias);
        fs.symlinkSync(target, otherAlias);
        initConfigPath(scenario === 'edited alias' ? target : alias);
        const command = buildStatusLineCommand('global');
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify({ statusLine: { type: 'command', command } }));
        initConfigPath(scenario === 'installed alias' ? target : otherAlias);

        await saveSettings(SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] }));
        const saved = JSON.parse(fs.readFileSync(getClaudeSettingsPath(), 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks?.PreToolUse).toHaveLength(1);
        expect(saved.hooks?.UserPromptSubmit).toHaveLength(1);

        await saveSettings(DEFAULT_SETTINGS);
        const removed = JSON.parse(fs.readFileSync(getClaudeSettingsPath(), 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(removed.hooks).toBeUndefined();
    });

    it('syncs hooks for a matching config path that does not exist yet', async () => {
        initConfigPath(path.join(testClaudeConfigDir, 'new.json'));
        const command = buildStatusLineCommand('global');
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify({ statusLine: { type: 'command', command } }));
        await syncWidgetHooks(SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] }));
        const saved = JSON.parse(fs.readFileSync(getClaudeSettingsPath(), 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks?.PreToolUse).toHaveLength(1);
        expect(saved.hooks?.UserPromptSubmit).toHaveLength(1);
    });

    it('syncs hooks when saving a config whose generated command quotes a literal $HOME', async () => {
        initConfigPath(path.join(testClaudeConfigDir, '$HOME', 'config.json'));
        const command = buildStatusLineCommand('global');
        fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify({ statusLine: { type: 'command', command } }));
        await saveSettings(SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] }));
        const saved = JSON.parse(fs.readFileSync(getClaudeSettingsPath(), 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(saved.hooks?.PreToolUse).toHaveLength(1);
        expect(saved.hooks?.UserPromptSubmit).toHaveLength(1);
    });

    it('is idempotent — repeated syncs heal legacy hooks without accumulating', async () => {
        const settingsPath = getClaudeSettingsPath();
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
