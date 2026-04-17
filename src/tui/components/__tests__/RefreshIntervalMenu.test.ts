import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    RefreshIntervalMenu,
    buildConfigureStatusLineItems,
    validateRefreshIntervalInput
} from '../RefreshIntervalMenu';

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

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

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
        getOutput() {
            return chunks.join('');
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

describe('validateRefreshIntervalInput', () => {
    it('should accept empty string (remove interval)', () => {
        expect(validateRefreshIntervalInput('')).toBeNull();
    });

    it('should accept valid values within range', () => {
        expect(validateRefreshIntervalInput('1')).toBeNull();
        expect(validateRefreshIntervalInput('10')).toBeNull();
        expect(validateRefreshIntervalInput('30')).toBeNull();
        expect(validateRefreshIntervalInput('60')).toBeNull();
    });

    it('should reject values below minimum', () => {
        expect(validateRefreshIntervalInput('0')).toContain('Minimum');
    });

    it('should reject values above maximum', () => {
        expect(validateRefreshIntervalInput('61')).toContain('Maximum');
    });

    it('should reject non-numeric input', () => {
        expect(validateRefreshIntervalInput('abc')).toContain('valid number');
    });
});

describe('buildConfigureStatusLineItems', () => {
    it('should show (not set) when interval is null and supported', () => {
        const items = buildConfigureStatusLineItems(null, true);
        expect(items[0]?.sublabel).toBe('(not set)');
    });

    it('should show seconds for set intervals', () => {
        const items = buildConfigureStatusLineItems(10, true);
        expect(items[0]?.sublabel).toBe('(10s)');
    });

    it('should show seconds for small values', () => {
        const items = buildConfigureStatusLineItems(1, true);
        expect(items[0]?.sublabel).toBe('(1s)');
    });

    it('should show version requirement when not supported', () => {
        const items = buildConfigureStatusLineItems(null, false);
        expect(items[0]?.sublabel).toContain('requires Claude Code');
        expect(items[0]?.disabled).toBe(true);
    });

    it('should not be disabled when supported', () => {
        const items = buildConfigureStatusLineItems(10, true);
        expect(items[0]?.disabled).toBeFalsy();
    });
});

describe('RefreshIntervalMenu', () => {
    it('keeps an unset interval empty when reopening the editor', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(RefreshIntervalMenu, {
                currentInterval: null,
                supportsRefreshInterval: true,
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
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(stdout.getOutput()).toContain('Enter refresh interval in seconds (1-60):');
            expect(stdout.getOutput()).not.toContain('10s');

            stdin.write('\r');
            await flushInk();

            expect(onUpdate).toHaveBeenCalledWith(null);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});