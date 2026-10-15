import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { ClaudeSettings } from '../../types/ClaudeSettings';
import {
    buildSharedModeCommand,
    classifyInstallation,
    disableSharedMode,
    enableSharedMode,
    getDaemonClientWrapperPath,
    getExistingStatusLine,
    installStatusLine,
    isKnownCommand,
    isSharedModeCommand,
    loadClaudeSettings
} from '../claude-settings';
import * as config from '../config';

// Opt-in shared mode (#19): switching the Claude Code statusLine to the IPC
// client wrapper must be reversible (previous one-shot command restored
// verbatim) and must never touch anything on the render path — these tests
// pin both directions of the switch.

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';

function readClaudeSettings(): ClaudeSettings {
    const content = fs.readFileSync(path.join(testClaudeConfigDir, 'settings.json'), 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
}

function writeRawClaudeSettings(content: string): void {
    const settingsPath = path.join(testClaudeConfigDir, 'settings.json');
    fs.mkdirSync(testClaudeConfigDir, { recursive: true });
    fs.writeFileSync(settingsPath, content, 'utf-8');
}

beforeEach(() => {
    testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-shared-mode-'));
    process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
    config.initConfigPath(path.join(testClaudeConfigDir, 'ccstatusline-settings.json'));
});

afterEach(() => {
    config.initConfigPath();
    if (testClaudeConfigDir) {
        fs.rmSync(testClaudeConfigDir, { recursive: true, force: true });
    }
    if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
        Reflect.deleteProperty(process.env, 'CLAUDE_CONFIG_DIR');
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
});

describe('getDaemonClientWrapperPath', () => {
    it('resolves the shipped IPC client wrapper next to this install', () => {
        const wrapper = getDaemonClientWrapperPath() ?? '';
        expect(fs.existsSync(wrapper)).toBe(true);
        expect(wrapper.endsWith(path.join('client', 'ccstatusline-ipc'))).toBe(true);
    });
});

describe('enableSharedMode', () => {
    it('remembers the previous one-shot command and writes the wrapper command', async () => {
        await installStatusLine({ commandMode: 'auto-npx' });
        const previous = await getExistingStatusLine();

        const result = await enableSharedMode();
        expect(result.statusLineWritten).toBe(true);

        const claude = readClaudeSettings();
        expect(claude.statusLine?.command).toBe(buildSharedModeCommand(result.wrapperPath ?? ''));
        expect(claude.statusLine?.padding).toBe(0);
        // The previous command is recorded in ccstatusline's own settings.
        const own = JSON.parse(fs.readFileSync(config.getConfigPath(), 'utf-8')) as { daemonSharedMode?: { previousStatusLine: { command: string } | null } };
        expect(own.daemonSharedMode?.previousStatusLine?.command).toBe(previous);

        // The wrapper command counts as an installed ccstatusline status line.
        expect(isKnownCommand(claude.statusLine?.command ?? '')).toBe(true);
        expect(isSharedModeCommand(claude.statusLine?.command ?? '')).toBe(true);
        expect(classifyInstallation(claude.statusLine?.command).method).toBe('self-managed');
    });

    it('remembers an absent previous statusLine as null', async () => {
        const result = await enableSharedMode();
        expect(result.statusLineWritten).toBe(true);
        const own = JSON.parse(fs.readFileSync(config.getConfigPath(), 'utf-8')) as { daemonSharedMode?: { previousStatusLine: unknown } };
        expect(own.daemonSharedMode?.previousStatusLine).toBeNull();
    });

    it('is idempotent: a repeated enable keeps the originally remembered command', async () => {
        await installStatusLine({ commandMode: 'global' });
        await enableSharedMode();
        // A second run over shared mode must not overwrite the memory of the
        // one-shot command with the wrapper itself.
        const second = await enableSharedMode();
        expect(second.statusLineWritten).toBe(false);
        expect(second.reason).toBe('shared mode is already active');
        const own = JSON.parse(fs.readFileSync(config.getConfigPath(), 'utf-8')) as { daemonSharedMode?: { previousStatusLine: { command: string } | null } };
        expect(own.daemonSharedMode?.previousStatusLine?.command).toContain('ccstatusline');
        expect(own.daemonSharedMode?.previousStatusLine?.command).not.toContain('ccstatusline-ipc');
    });

    it('refuses when Claude settings are unreadable and writes nothing', async () => {
        writeRawClaudeSettings('{ not json');
        const result = await enableSharedMode();
        expect(result.statusLineWritten).toBe(false);
        expect(result.reason).toContain('refusing');
        expect(readClaudeSettingsRaw()).toBe('{ not json');
    });

    it('refuses when ccstatusline settings are unreadable and writes nothing', async () => {
        // loadSettings hands back in-memory defaults for a corrupt file; a
        // naive save would rewrite the user's settings.json with defaults
        // plus the shared-mode marker (#19 review). Refuse instead.
        fs.writeFileSync(config.getConfigPath(), '{ not json', 'utf-8');
        const result = await enableSharedMode();
        expect(result.statusLineWritten).toBe(false);
        expect(result.reason).toContain('refusing to modify');
        expect(fs.readFileSync(config.getConfigPath(), 'utf-8')).toBe('{ not json');
        expect(fs.existsSync(path.join(testClaudeConfigDir, 'settings.json'))).toBe(false);
    });

    function readClaudeSettingsRaw(): string {
        return fs.readFileSync(path.join(testClaudeConfigDir, 'settings.json'), 'utf-8');
    }

    // The missing-curl refusal (enableSharedMode → isExecutableAvailable) has
    // no unit test on purpose: bun's execSync honors an explicit env option in
    // isolation but not under the full-suite runner, so a PATH-based test is
    // flaky by construction. The branch is one try/catch around `which curl`.

    it('refuses on Windows and leaves the status line untouched', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
        try {
            await installStatusLine({ commandMode: 'global' });
            const before = await getExistingStatusLine();
            const result = await enableSharedMode();
            expect(result.statusLineWritten).toBe(false);
            expect(result.reason).toContain('Windows');
            expect(await getExistingStatusLine()).toBe(before);
        } finally {
            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
    });
});

describe('disableSharedMode', () => {
    it('restores the previous one-shot command verbatim', async () => {
        await installStatusLine({ commandMode: 'auto-bunx', supportsRefreshInterval: true });
        const before = await loadClaudeSettings();
        await enableSharedMode();
        expect((await getExistingStatusLine()) ?? '').toContain('ccstatusline-ipc');

        const result = await disableSharedMode();
        expect(result.statusLineRestored).toBe(true);

        const after = await loadClaudeSettings();
        expect(after.statusLine).toEqual(before.statusLine);
        // The shared-mode marker is cleared from ccstatusline's settings.
        const own = JSON.parse(fs.readFileSync(config.getConfigPath(), 'utf-8')) as { daemonSharedMode?: unknown };
        expect(own.daemonSharedMode).toBeUndefined();
        expect(isSharedModeCommand(after.statusLine?.command ?? '')).toBe(false);
    });

    it('removes the status line entirely when shared mode replaced an absent one', async () => {
        await enableSharedMode();
        expect(await getExistingStatusLine()).toContain('ccstatusline-ipc');

        const result = await disableSharedMode();
        expect(result.statusLineRestored).toBe(true);
        const claude = readClaudeSettings();
        expect(claude.statusLine).toBeUndefined();
    });

    it('is a no-op when shared mode was never enabled', async () => {
        const result = await disableSharedMode();
        expect(result.statusLineRestored).toBe(false);
        expect(result.reason).toContain('not enabled');
    });

    it('refuses when ccstatusline settings are unreadable instead of misreporting not-enabled', async () => {
        await enableSharedMode();
        fs.writeFileSync(config.getConfigPath(), '{ not json', 'utf-8');
        const result = await disableSharedMode();
        expect(result.statusLineRestored).toBe(false);
        expect(result.reason).toContain('refusing to modify');
        // The Claude status line still holds the wrapper: nothing was touched.
        expect((await getExistingStatusLine()) ?? '').toContain('ccstatusline-ipc');
    });
});
