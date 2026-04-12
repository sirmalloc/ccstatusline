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

import { DEFAULT_SETTINGS } from '../../types/Settings';
import { CCSTATUSLINE_COMMANDS } from '../claude-settings';
import { syncWidgetHooks } from '../hooks';

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

    it('syncs hooks to settings.local.json when statusLine lives there', async () => {
        // Write statusLine to local file, not global
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        fs.writeFileSync(localPath, JSON.stringify({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            }
        }, null, 2), 'utf-8');

        const settingsWithSkills = {
            ...DEFAULT_SETTINGS,
            lines: [[{ id: 'skills-1', type: 'skills' }], [], []]
        };

        await syncWidgetHooks(settingsWithSkills);

        // Hooks should be written to local file, not global
        const localSaved = JSON.parse(fs.readFileSync(localPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(localSaved.hooks?.PreToolUse).toBeDefined();

        // Global should not have hooks
        const globalPath = path.join(testClaudeConfigDir, 'settings.json');
        if (fs.existsSync(globalPath)) {
            const globalSaved = JSON.parse(fs.readFileSync(globalPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
            expect(globalSaved.hooks?.PreToolUse).toBeUndefined();
        }
    });

    it('subsequent sync does not recreate hooks in old file', async () => {
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        fs.writeFileSync(localPath, JSON.stringify({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            }
        }, null, 2), 'utf-8');

        const settingsWithSkills = {
            ...DEFAULT_SETTINGS,
            lines: [[{ id: 'skills-1', type: 'skills' }], [], []]
        };

        // First sync
        await syncWidgetHooks(settingsWithSkills);
        // Second sync (simulates saving settings again)
        await syncWidgetHooks(settingsWithSkills);

        // Global should still have no managed hooks
        const globalPath = path.join(testClaudeConfigDir, 'settings.json');
        if (fs.existsSync(globalPath)) {
            const globalSaved = JSON.parse(fs.readFileSync(globalPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
            const hasManagedHooks = Object.values(globalSaved.hooks ?? {}).some(
                (entries: unknown[]) => (entries as Array<{ _tag?: string }>).some(e => e._tag === 'ccstatusline-managed')
            );
            expect(hasManagedHooks).toBe(false);
        }
    });

    it('cleans stale managed hooks from non-active file', async () => {
        // Global file has stale managed hooks
        const globalPath = path.join(testClaudeConfigDir, 'settings.json');
        fs.writeFileSync(globalPath, JSON.stringify({
            hooks: {
                PreToolUse: [
                    {
                        _tag: 'ccstatusline-managed',
                        matcher: 'Skill',
                        hooks: [{ type: 'command', command: 'old-command --hook' }]
                    }
                ]
            }
        }, null, 2), 'utf-8');

        // StatusLine is in local file
        const localPath = path.join(testClaudeConfigDir, 'settings.local.json');
        fs.writeFileSync(localPath, JSON.stringify({
            statusLine: {
                type: 'command',
                command: CCSTATUSLINE_COMMANDS.NPM,
                padding: 0
            }
        }, null, 2), 'utf-8');

        await syncWidgetHooks(DEFAULT_SETTINGS);

        // Stale hooks should be removed from global
        const globalSaved = JSON.parse(fs.readFileSync(globalPath, 'utf-8')) as { hooks?: Record<string, unknown[]> };
        expect(globalSaved.hooks).toBeUndefined();
    });
});