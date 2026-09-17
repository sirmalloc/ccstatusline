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
    validateCustomCommandCacheTtlInput,
    validateGitCacheTtlInput,
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

describe('validateGitCacheTtlInput', () => {
    it('should accept valid values within range', () => {
        expect(validateGitCacheTtlInput('0')).toBeNull();
        expect(validateGitCacheTtlInput('5')).toBeNull();
        expect(validateGitCacheTtlInput('60')).toBeNull();
    });

    it('should reject values outside the range', () => {
        expect(validateGitCacheTtlInput('-1')).toContain('Minimum');
        expect(validateGitCacheTtlInput('61')).toContain('Maximum');
    });

    it('should reject empty and non-numeric input', () => {
        expect(validateGitCacheTtlInput('')).toContain('valid number');
        expect(validateGitCacheTtlInput('abc')).toContain('valid number');
    });
});

describe('validateCustomCommandCacheTtlInput', () => {
    it('should accept valid values within range', () => {
        expect(validateCustomCommandCacheTtlInput('0')).toBeNull();
        expect(validateCustomCommandCacheTtlInput('5')).toBeNull();
        expect(validateCustomCommandCacheTtlInput('60')).toBeNull();
    });

    it('should reject values outside the range', () => {
        expect(validateCustomCommandCacheTtlInput('-1')).toContain('Minimum');
        expect(validateCustomCommandCacheTtlInput('61')).toContain('Maximum');
    });

    it('should reject empty and non-numeric input', () => {
        expect(validateCustomCommandCacheTtlInput('')).toContain('valid number');
        expect(validateCustomCommandCacheTtlInput('abc')).toContain('valid number');
    });

    it('should name the field it rejects', () => {
        expect(validateCustomCommandCacheTtlInput('61')).toContain('custom command cache TTL');
    });
});

describe('buildConfigureStatusLineItems', () => {
    it('should show (not set) when interval is null and supported', () => {
        const items = buildConfigureStatusLineItems(null, true, 5, 5);
        expect(items[0]?.sublabel).toBe('(not set)');
    });

    it('should show seconds for set intervals', () => {
        const items = buildConfigureStatusLineItems(10, true, 5, 5);
        expect(items[0]?.sublabel).toBe('(10s)');
    });

    it('should show seconds for small values', () => {
        const items = buildConfigureStatusLineItems(1, true, 5, 5);
        expect(items[0]?.sublabel).toBe('(1s)');
    });

    it('should show version requirement when not supported', () => {
        const items = buildConfigureStatusLineItems(null, false, 5, 5);
        expect(items[0]?.sublabel).toContain('requires Claude Code');
        expect(items[0]?.disabled).toBe(true);
    });

    it('should not be disabled when supported', () => {
        const items = buildConfigureStatusLineItems(10, true, 5, 5);
        expect(items[0]?.disabled).toBeFalsy();
    });

    it('should show the configured Git cache TTL', () => {
        const items = buildConfigureStatusLineItems(10, true, 5, 5);
        expect(items[1]?.label).toContain('Git Cache TTL');
        expect(items[1]?.sublabel).toBe('(5s)');
    });

    it('should describe zero Git cache TTL as mtime-only', () => {
        const items = buildConfigureStatusLineItems(10, true, 0, 5);
        expect(items[1]?.sublabel).toBe('(mtime only)');
    });

    it('should show the configured custom command cache TTL', () => {
        const items = buildConfigureStatusLineItems(10, true, 5, 3);
        expect(items[2]?.label).toContain('Custom Command Cache TTL');
        expect(items[2]?.sublabel).toBe('(3s)');
    });

    it('should describe zero custom command cache TTL as disabled', () => {
        const items = buildConfigureStatusLineItems(10, true, 5, 0);
        expect(items[2]?.sublabel).toBe('(disabled)');
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
                gitCacheTtlSeconds: 5,
                customCommandCacheTtlSeconds: 5,
                onUpdate,
                onGitCacheTtlUpdate: vi.fn(),
                onCustomCommandCacheTtlUpdate: vi.fn(),
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

    it('shows helper text while editing Git cache TTL and saves updates', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn();
        const onGitCacheTtlUpdate = vi.fn();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(RefreshIntervalMenu, {
                currentInterval: 10,
                supportsRefreshInterval: true,
                gitCacheTtlSeconds: 0,
                customCommandCacheTtlSeconds: 5,
                onUpdate,
                onGitCacheTtlUpdate,
                onCustomCommandCacheTtlUpdate: vi.fn(),
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
            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(stdout.getOutput()).toContain('Enter Git cache TTL in seconds (0-60):');
            expect(stdout.getOutput()).toContain('unstaged and untracked working-tree changes');

            stdin.write('\r');
            await flushInk();

            expect(onGitCacheTtlUpdate).toHaveBeenCalledWith(0);
            expect(onUpdate).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('edits the custom command cache TTL without touching the Git cache TTL', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onGitCacheTtlUpdate = vi.fn();
        const onCustomCommandCacheTtlUpdate = vi.fn();
        const instance = render(
            React.createElement(RefreshIntervalMenu, {
                currentInterval: 10,
                supportsRefreshInterval: true,
                gitCacheTtlSeconds: 5,
                customCommandCacheTtlSeconds: 0,
                onUpdate: vi.fn(),
                onGitCacheTtlUpdate,
                onCustomCommandCacheTtlUpdate,
                onBack: vi.fn()
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
            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(stdout.getOutput()).toContain('Enter custom command cache TTL in seconds (0-60):');
            expect(stdout.getOutput()).toContain('how often they spawn a shell');

            stdin.write('7');
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(onCustomCommandCacheTtlUpdate).toHaveBeenCalledWith(7);
            expect(onGitCacheTtlUpdate).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
