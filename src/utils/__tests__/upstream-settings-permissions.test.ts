import {
    chmodSync,
    existsSync,
    mkdtempSync,
    rmSync,
    statSync,
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

import { DEFAULT_SETTINGS } from '../../types/Settings';
import { installStatusLine } from '../claude-settings';
import {
    initConfigPath,
    saveSettings
} from '../config';

// Upstream 4c62e31: saving rewrote a private settings file through a temp
// file (which took the default permissions) and wrote .orig/.bak backups
// world-readable — both leak the same secrets (env, apiKeyHelper) the
// private original held.

describe('upstream 4c62e31: private settings stay private on save', () => {
    let savedEnv: Record<string, string | undefined> = {};
    let workDir = '';

    beforeEach(() => {
        savedEnv = {
            HOME: process.env.HOME,
            CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
            GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
            GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM
        };
        workDir = mkdtempSync(join(tmpdir(), 'ccsl-settings-perms-'));
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
        initConfigPath();
        rmSync(workDir, { recursive: true, force: true });
    });

    it('keeps 0600 on ccstatusline settings across a save', async () => {
        const configPath = join(workDir, 'settings.json');
        writeFileSync(configPath, '{}');
        chmodSync(configPath, 0o600);
        initConfigPath(configPath);

        await saveSettings(DEFAULT_SETTINGS);

        expect(statSync(configPath).mode & 0o777).toBe(0o600);
    });

    it('gives the .orig backup of private Claude settings their 0600', async () => {
        const settingsPath = join(workDir, 'settings.json');
        writeFileSync(settingsPath, JSON.stringify({ env: { API_KEY: 'secret' } }));
        chmodSync(settingsPath, 0o600);

        await installStatusLine({ commandMode: 'auto-npx' });

        const origPath = `${settingsPath}.orig`;
        expect(existsSync(origPath)).toBe(true);
        expect(statSync(origPath).mode & 0o777).toBe(0o600);
        expect(existsSync(`${settingsPath}.bak`)).toBe(true);
    });

    it('recreates an existing backup so it does not keep loose permissions', async () => {
        const settingsPath = join(workDir, 'settings.json');
        writeFileSync(settingsPath, JSON.stringify({ env: { API_KEY: 'secret' } }));
        chmodSync(settingsPath, 0o600);
        writeFileSync(`${settingsPath}.orig`, '{ "stale": true }');
        chmodSync(`${settingsPath}.orig`, 0o777);

        await installStatusLine({ commandMode: 'auto-npx' });

        expect(statSync(`${settingsPath}.orig`).mode & 0o777).toBe(0o600);
    });

    it('re-installs over an existing status line', async () => {
        const settingsPath = join(workDir, 'settings.json');
        writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'old' } }));

        const result = await installStatusLine({ commandMode: 'auto-npx' });

        expect(result.statusLineWritten).toBe(true);
    });
});
