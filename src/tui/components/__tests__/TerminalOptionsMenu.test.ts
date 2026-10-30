import chalk from 'chalk';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React, { useState } from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    TerminalOptionsMenu,
    buildTerminalOptionsItems,
    getNextColorLevel,
    shouldWarnOnColorLevelChange
} from '../TerminalOptionsMenu';

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
            return stripAnsi(chunks.join(''));
        }
    });
}

// Truecolor with a hex widget color, so leaving Truecolor shows the custom-colors warning
const CUSTOM_COLOR_SETTINGS: Settings = {
    ...DEFAULT_SETTINGS,
    colorLevel: 3,
    lines: [[{ id: '1', type: 'model', color: 'hex:FF8800' }], [], []]
};

function StatefulTerminalOptionsMenu({ onBack }: { onBack: (target?: string) => void }) {
    const [settings, setSettings] = useState(CUSTOM_COLOR_SETTINGS);

    return React.createElement(TerminalOptionsMenu, {
        settings,
        onUpdate: setSettings,
        onBack
    });
}

describe('TerminalOptionsMenu helpers', () => {
    it('cycles color levels in order', () => {
        expect(getNextColorLevel(0)).toBe(1);
        expect(getNextColorLevel(1)).toBe(2);
        expect(getNextColorLevel(2)).toBe(3);
        expect(getNextColorLevel(3)).toBe(0);
    });

    it('warns only when custom colors would be lost', () => {
        expect(shouldWarnOnColorLevelChange(2, 3, true)).toBe(true);
        expect(shouldWarnOnColorLevelChange(3, 0, true)).toBe(true);
        expect(shouldWarnOnColorLevelChange(2, 2, true)).toBe(false);
        expect(shouldWarnOnColorLevelChange(1, 2, true)).toBe(false);
        expect(shouldWarnOnColorLevelChange(3, 0, false)).toBe(false);
    });

    it('builds terminal options list items with the current color level label', () => {
        const items = buildTerminalOptionsItems(2);

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            label: '▓ Color Level',
            sublabel: '(256 Color (default))',
            value: 'colorLevel'
        });
        expect(items[0]?.description).toContain('Truecolor');
    });
});

describe('TerminalOptionsMenu', () => {
    it('keeps Color Level highlighted after the custom-colors warning, so Enter cycles on', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onBack = vi.fn();
        const chalkLevel = chalk.level;
        const instance = render(
            React.createElement(StatefulTerminalOptionsMenu, { onBack }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  ▓ Color Level (Truecolor)');
            });
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Custom colors detected');
            });

            stdout.clearOutput();
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  ▓ Color Level (No Color)');
            });

            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  ▓ Color Level (Basic)');
            });
            expect(onBack).not.toHaveBeenCalled();
        } finally {
            chalk.level = chalkLevel;
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('keeps Color Level highlighted after Escape on the custom-colors warning', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(TerminalOptionsMenu, {
                settings: CUSTOM_COLOR_SETTINGS,
                onUpdate,
                onBack
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  ▓ Color Level (Truecolor)');
            });
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Custom colors detected');
            });

            stdout.clearOutput();
            stdin.write('\u001B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  ▓ Color Level (Truecolor)');
            });

            stdout.clearOutput();
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Custom colors detected');
            });
            expect(onUpdate).not.toHaveBeenCalled();
            expect(onBack).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
