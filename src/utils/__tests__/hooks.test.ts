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

        await syncWidgetHooks(settings);

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

    it('adds hooks for a ccstatusline command wrapped in a shell', async () => {
        const settingsPath = getClaudeSettingsPath();
        const command = 'bash -c \'head -1 | ccstatusline\'';
        fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command } }, null, 2), 'utf-8');

        const settings = SettingsSchema.parse({ lines: [[{ id: 'skills-1', type: 'skills' }]] });

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
