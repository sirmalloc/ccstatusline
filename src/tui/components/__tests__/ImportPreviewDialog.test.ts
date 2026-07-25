import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import {
    ImportPreviewDialog,
    getImportPreviewKeys,
    getImportPreviewSettings
} from '../ImportPreviewDialog';

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

function flushInk() {
    return new Promise(resolve => setTimeout(resolve, 25));
}

describe('ImportPreviewDialog helpers', () => {
    it('includes optional settings that exist only in the imported config', () => {
        const current: Settings = { ...DEFAULT_SETTINGS };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            defaultSeparator: ' | ',
            overrideForegroundColor: 'green'
        };

        expect('defaultSeparator' in current).toBe(false);
        expect('overrideForegroundColor' in current).toBe(false);
        expect(getImportPreviewKeys(current, imported)).toEqual(
            expect.arrayContaining(['defaultSeparator', 'overrideForegroundColor'])
        );
    });

    it('previews only explicitly imported fields in merge mode', () => {
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full',
            lines: [[{ id: 'custom', type: 'model' }]]
        };
        const validation = {
            status: 'valid' as const,
            data: { ...DEFAULT_SETTINGS, globalBold: true },
            presentKeys: ['version', 'globalBold'] as (keyof Settings)[]
        };

        const preview = getImportPreviewSettings(current, validation, 'merge');

        expect(preview.globalBold).toBe(true);
        expect(preview.flexMode).toBe('full');
        expect(preview.lines).toEqual(current.lines);
    });

    it('updates the dynamic preview when merge mode is highlighted', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full'
        };
        const instance = render(React.createElement(ImportPreviewDialog, {
            validation: {
                status: 'valid',
                data: { ...DEFAULT_SETTINGS, globalBold: true },
                presentKeys: ['version', 'globalBold']
            },
            currentSettings: current,
            onApply: () => undefined,
            onCancel: () => undefined
        }), {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await flushInk();
            expect(stdout.getOutput()).toContain('flexMode: full → full-minus-40');

            stdout.clearOutput();
            stdin.write('\u001B[B');
            await flushInk();

            const output = stdout.getOutput();
            const lastFlexModeRow = output.slice(output.lastIndexOf('flexMode:')).split('\n')[0];
            expect(lastFlexModeRow).toBe('flexMode: full');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
