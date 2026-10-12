import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { installStatusLine } from '../claude-settings';

// Upstream 475e401 (#627): a settings file that cannot be parsed (trailing
// comma, EACCES, a read racing Claude Code's own write) used to be replaced
// with a file holding only statusLine — permissions, hooks and env lost.
// The install must abort instead.

describe('upstream 475e401: unreadable Claude settings are not overwritten', () => {
    let savedEnv: Record<string, string | undefined> = {};
    let workDir = '';

    beforeEach(() => {
        savedEnv = {
            HOME: process.env.HOME,
            CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
            GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
            GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM
        };
        workDir = mkdtempSync(join(tmpdir(), 'ccsl-install-corrupt-'));
        process.env.HOME = workDir;
        process.env.CLAUDE_CONFIG_DIR = workDir;
        process.env.GIT_CONFIG_GLOBAL = '/dev/null';
        process.env.GIT_CONFIG_SYSTEM = '/dev/null';
    });

    afterEach(() => {
        process.env.HOME = savedEnv.HOME;
        process.env.CLAUDE_CONFIG_DIR = savedEnv.CLAUDE_CONFIG_DIR;
        process.env.GIT_CONFIG_GLOBAL = savedEnv.GIT_CONFIG_GLOBAL;
        process.env.GIT_CONFIG_SYSTEM = savedEnv.GIT_CONFIG_SYSTEM;
        rmSync(workDir, { recursive: true, force: true });
    });

    it('aborts without touching settings that cannot be parsed', async () => {
        const settingsPath = join(workDir, 'settings.json');
        writeFileSync(settingsPath, '{ invalid json');

        await expect(installStatusLine({ commandMode: 'auto-npx' })).rejects.toThrow(/left unchanged/);

        expect(readFileSync(settingsPath, 'utf-8')).toBe('{ invalid json');
    });

    it('keeps an unreadable file when the install is asked to keep existing', async () => {
        const settingsPath = join(workDir, 'settings.json');
        writeFileSync(settingsPath, '{ invalid json');

        const result = await installStatusLine({ commandMode: 'auto-npx', keepExisting: true });

        expect(result.statusLineWritten).toBe(false);
        expect(readFileSync(settingsPath, 'utf-8')).toBe('{ invalid json');
    });

    it('keeps the existing status line when asked to, even without keep-unreadable errors', async () => {
        const settingsPath = join(workDir, 'settings.json');
        const original = JSON.stringify({ statusLine: { type: 'command', command: 'old' }, env: { X: '1' } });
        writeFileSync(settingsPath, original);

        const result = await installStatusLine({ commandMode: 'auto-npx', keepExisting: true });

        expect(result.statusLineWritten).toBe(false);
        expect(readFileSync(settingsPath, 'utf-8')).toBe(original);
    });
});
