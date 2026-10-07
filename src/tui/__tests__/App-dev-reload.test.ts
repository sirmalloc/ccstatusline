import chalk from 'chalk';
import { render } from 'ink';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
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
import { initConfigPath } from '../../utils/config';
import {
    isDevReloadRequested,
    readDevReloadSnapshot,
    writeDevReloadSnapshot
} from '../../utils/dev-reload';
import * as powerline from '../../utils/powerline';
import { App } from '../App';
import * as claudeStatus from '../claude-status';

import { waitFor } from './helpers/wait-for-ink';

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

const CTRL_R = '\u0012';

// A TUI started by the dev reload supervisor after ctrl+r: it picks up the
// snapshot the previous process left, and ctrl+r writes a new one
describe('App under dev reload', () => {
    let tempDir: string;
    let stateFile: string;
    const savedEnv = { ...process.env };
    const savedChalkLevel = chalk.level;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-app-reload-'));
        stateFile = path.join(tempDir, 'state.json');
        initConfigPath(path.join(tempDir, 'settings.json'));
        process.env.CCSTATUSLINE_DEV_RELOAD = '1';
        process.env.CCSTATUSLINE_DEV_RELOAD_STATE = stateFile;

        // Keep App's startup checks off the real machine: Claude Code, its
        // settings, package managers and installed fonts
        vi.spyOn(claudeSettings, 'isClaudeCodeVersionAtLeast').mockReturnValue(false);
        vi.spyOn(claudeSettings, 'getPackageCommandAvailability').mockReturnValue({ npm: false, npx: false, bun: false, bunx: false });
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState').mockResolvedValue({ existingStatusLine: null, refreshInterval: null });
        vi.spyOn(claudeSettings, 'isInstalled').mockResolvedValue(false);
        vi.spyOn(powerline, 'checkPowerlineFonts').mockReturnValue({ installed: true });
        vi.spyOn(powerline, 'checkPowerlineFontsAsync').mockResolvedValue({ installed: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env = { ...savedEnv };
        initConfigPath();
        chalk.level = savedChalkLevel;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('resumes where ctrl+r left off, and ctrl+r saves where it is now', async () => {
        const edited: Settings = {
            ...DEFAULT_SETTINGS,
            lines: [
                [{ id: 'a', type: 'model' }],
                [{ id: 'b', type: 'custom-text', customText: 'unsaved edit' }]
            ]
        };
        writeDevReloadSnapshot(stateFile, {
            settings: edited,
            originalSettings: DEFAULT_SETTINGS,
            screen: 'items',
            selectedLine: 1,
            menuSelections: { lines: 1 },
            itemsCursor: 0
        });

        const stdin = new MockTtyStream();
        const stdout = new MockTtyStream();
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer | string) => {
            chunks.push(chunk.toString());
        });
        const instance = render(React.createElement(App), {
            stdin: stdin as unknown as NodeJS.ReadStream,
            stdout: stdout as unknown as NodeJS.WriteStream,
            stderr: new MockTtyStream() as unknown as NodeJS.WriteStream,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            // Line 2's editor, with the unsaved widget and the reload hint
            await waitFor(() => {
                const output = stripAnsi(chunks.join(''));
                expect(output).toContain('Edit Line 2');
                expect(output).toContain('unsaved edit');
                expect(output).toContain('dev reload: ctrl+r');
            });

            fs.rmSync(stateFile);
            stdin.write(CTRL_R);
            await waitFor(() => {
                expect(fs.existsSync(stateFile)).toBe(true);
            });
            expect(isDevReloadRequested()).toBe(true);

            const snapshot = readDevReloadSnapshot(stateFile);
            expect(snapshot?.screen).toBe('items');
            expect(snapshot?.selectedLine).toBe(1);
            expect(snapshot?.settings.lines[1]).toEqual(edited.lines[1]);
            expect(snapshot?.originalSettings.lines).toEqual(DEFAULT_SETTINGS.lines);
        } finally {
            instance.unmount();
            instance.cleanup();
        }
    });
});
