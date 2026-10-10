import chalk from 'chalk';
import { render } from 'ink';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    expect,
    vi
} from 'vitest';

import * as claudeSettings from '../../../utils/claude-settings';
import { initConfigPath } from '../../../utils/config';
import * as globalCommandResolution from '../../../utils/global-command-resolution';
import * as powerline from '../../../utils/powerline';
import { App } from '../../App';

import { waitFor } from './wait-for-ink';

export const KEYS = {
    up: '\u001B[A',
    down: '\u001B[B',
    enter: '\r',
    escape: '\u001B',
    ctrlS: '\u0013'
};

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 60;

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

export interface AppSandbox {
    settingsPath: string;
    restore: () => void;
}

// Points the TUI at a scratch settings file and Claude config dir, and stubs the
// probes that would run the Claude CLI, package managers or font lookups. Tests
// stub the Claude status line and install state they need on top of this.
export function setUpAppSandbox(): AppSandbox {
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    // The TUI sets chalk's global color level from the settings it loads, so
    // it's put back for the test files that run after this one
    const originalChalkLevel = chalk.level;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-app-'));
    const settingsPath = path.join(dir, 'settings.json');
    process.env.CLAUDE_CONFIG_DIR = path.join(dir, 'claude');
    initConfigPath(settingsPath);
    vi.spyOn(claudeSettings, 'isClaudeCodeVersionAtLeast').mockReturnValue(false);
    vi.spyOn(claudeSettings, 'getPackageCommandAvailability').mockReturnValue({ npm: true, npx: true, bun: false, bunx: false });
    vi.spyOn(powerline, 'checkPowerlineFonts').mockReturnValue({ installed: true });
    vi.spyOn(powerline, 'checkPowerlineFontsAsync').mockResolvedValue({ installed: true });
    vi.spyOn(globalCommandResolution, 'inspectGlobalCommandResolution').mockReturnValue({
        resolvedPaths: [],
        firstResolvedPath: null,
        expectedBinDir: null,
        warning: null
    });

    return {
        settingsPath,
        restore: () => {
            vi.restoreAllMocks();
            chalk.level = originalChalkLevel;
            initConfigPath();
            if (originalClaudeConfigDir === undefined) {
                delete process.env.CLAUDE_CONFIG_DIR;
            } else {
                process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
            }
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}

export function renderApp() {
    const stdin = new MockTtyStream();
    const stdout = new MockTtyStream();
    const stderr = new MockTtyStream();
    const chunks: string[] = [];
    stdout.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    const instance = render(React.createElement(App), {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false
    });

    return {
        stdin,
        // Debug mode writes whole frames, so the last chunk is the current screen
        getFrame: () => stripAnsi(chunks.at(-1) ?? ''),
        cleanup: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

export type RenderedApp = ReturnType<typeof renderApp>;

export async function pressKey(rendered: RenderedApp, key: string, expectedText: string): Promise<void> {
    rendered.stdin.write(key);
    await waitFor(() => {
        expect(rendered.getFrame()).toContain(expectedText);
    });
}
