import chalk from 'chalk';
import * as fs from 'fs';
import { render } from 'ink';
import * as os from 'os';
import * as path from 'path';
import React from 'react';
import { PassThrough } from 'stream';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import * as claudeSettings from '../../utils/claude-settings';
import * as config from '../../utils/config';
import * as powerline from '../../utils/powerline';
import {
    getScope,
    initScope,
    setScope
} from '../../utils/scope';
import { App } from '../App';
import * as claudeStatus from '../claude-status';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
}

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        clearOutput() {
            chunks.length = 0;
        },
        getOutput() {
            return chunks.join('');
        }
    });
}

async function waitFor(assertion: () => void): Promise<void> {
    const deadline = Date.now() + 1000;
    let lastError: unknown;

    while (Date.now() < deadline) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    throw lastError;
}

describe('App scope reload guard', () => {
    let projectDir = '';

    beforeEach(() => {
        vi.clearAllMocks();
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-app-scope-'));
        setScope({ type: 'project', root: projectDir });
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState').mockResolvedValue({
            existingStatusLine: null,
            refreshInterval: null
        });
        vi.spyOn(claudeSettings, 'isInstalled').mockResolvedValue(false);
        vi.spyOn(config, 'saveSettings').mockResolvedValue(undefined);
        const fontStatus = { installed: true, checkedSymbol: '\uE0B0' };
        vi.spyOn(powerline, 'checkPowerlineFonts').mockReturnValue(fontStatus);
        vi.spyOn(powerline, 'checkPowerlineFontsAsync').mockResolvedValue(fontStatus);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        initScope({});
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('blocks saving stale source settings until the target scope finishes loading', async () => {
        const sourceSettings: Settings = {
            ...DEFAULT_SETTINGS,
            lines: [[{ id: 'source-text', type: 'custom-text', customText: 'source' }], [], []]
        };
        let resolveTargetSettings: ((settings: Settings) => void) | undefined;
        const targetSettings = new Promise<Settings>((resolve) => {
            resolveTargetSettings = resolve;
        });
        const loadSettings = vi.spyOn(config, 'loadSettings');
        loadSettings
            .mockResolvedValueOnce(sourceSettings)
            .mockReturnValueOnce(targetSettings);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(<App />, {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Project');
            });
            await new Promise(resolve => setTimeout(resolve, 25));

            stdout.clearOutput();
            stdin.write('\x10');

            await waitFor(() => {
                expect(loadSettings).toHaveBeenCalledTimes(2);
                expect(getScope()).toEqual({ type: 'global' });
                expect(stdout.getOutput()).toContain('Loading settings...');
            });

            stdin.write('\x13');
            await new Promise(resolve => setTimeout(resolve, 25));
            expect(config.saveSettings).not.toHaveBeenCalled();

            stdout.clearOutput();
            resolveTargetSettings?.(DEFAULT_SETTINGS);

            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Global');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('does not switch scopes while a settings save is in flight', async () => {
        const loadSettings = vi.spyOn(config, 'loadSettings').mockResolvedValue(DEFAULT_SETTINGS);
        let resolveSave: (() => void) | undefined;
        const pendingSave = new Promise<void>((resolve) => {
            resolveSave = resolve;
        });
        const saveSettings = vi.spyOn(config, 'saveSettings').mockReturnValueOnce(pendingSave);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(<App />, {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Project');
            });
            await new Promise(resolve => setTimeout(resolve, 25));

            stdin.write('\x13');
            await waitFor(() => {
                expect(saveSettings).toHaveBeenCalledOnce();
            });

            stdout.clearOutput();
            stdin.write('\x10');
            await new Promise(resolve => setTimeout(resolve, 25));

            expect(getScope()).toEqual({ type: 'project', root: projectDir });
            expect(loadSettings).toHaveBeenCalledOnce();
            expect(stdout.getOutput()).toContain('Wait for the current save before switching modes');

            resolveSave?.();
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Configuration saved');
            });

            stdin.write('\x10');
            await waitFor(() => {
                expect(getScope()).toEqual({ type: 'global' });
                expect(loadSettings).toHaveBeenCalledTimes(2);
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('keeps a seeded project non-interactive until its status data reloads', async () => {
        setScope({ type: 'global' });
        vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
        const loadSettings = vi.spyOn(config, 'loadSettings').mockResolvedValue(DEFAULT_SETTINGS);
        let resolveProjectStatus: ((status: {
            existingStatusLine: string | null;
            refreshInterval: number | null;
        }) => void) | undefined;
        const projectStatus = new Promise<{
            existingStatusLine: string | null;
            refreshInterval: number | null;
        }>((resolve) => {
            resolveProjectStatus = resolve;
        });
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState')
            .mockResolvedValueOnce({
                existingStatusLine: 'bunx -y ccstatusline@latest',
                refreshInterval: 5
            })
            .mockReturnValueOnce(projectStatus);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(<App />, {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Global');
            });
            await new Promise(resolve => setTimeout(resolve, 25));

            stdin.write('\x10');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('No project config found');
            });

            stdin.write('\u001B[B');
            await new Promise(resolve => setTimeout(resolve, 25));
            stdin.write('\r');
            await waitFor(() => {
                expect(getScope()).toEqual({ type: 'project', root: projectDir });
                expect(stdout.getOutput()).toContain('Loading settings...');
            });

            stdin.write('\x10');
            await new Promise(resolve => setTimeout(resolve, 25));
            expect(getScope()).toEqual({ type: 'project', root: projectDir });
            expect(loadSettings).toHaveBeenCalledOnce();

            stdout.clearOutput();
            resolveProjectStatus?.({
                existingStatusLine: null,
                refreshInterval: null
            });
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Project');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('applies the seeded settings color level when starting with defaults', async () => {
        const previousChalkLevel = chalk.level;
        setScope({ type: 'global' });
        vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
        const globalSettings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 0
        };
        vi.spyOn(config, 'loadSettings').mockResolvedValue(globalSettings);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(<App />, {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Global');
                expect(chalk.level).toBe(0);
            });
            await new Promise(resolve => setTimeout(resolve, 25));

            stdin.write('\x10');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('No project config found');
            });

            stdin.write('\u001B[B');
            await new Promise(resolve => setTimeout(resolve, 25));
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Mode: Project');
            });

            expect(chalk.level).toBe(DEFAULT_SETTINGS.colorLevel);
        } finally {
            chalk.level = previousChalkLevel;
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
