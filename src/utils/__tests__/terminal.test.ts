import { execFileSync } from 'child_process';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    canDetectTerminalWidth,
    getTerminalWidth,
    resetTerminalWidthCache
} from '../terminal';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

describe('terminal utils', () => {
    const mockExecFileSync = execFileSync as unknown as {
        mock: { calls: unknown[][] };
        mockImplementation: (impl: (file: string, args: string[]) => string) => void;
        mockImplementationOnce: (impl: () => never) => void;
        mockReturnValueOnce: (value: string) => void;
    };

    // process.platform is read by the width probe. Pin it with defineProperty
    // and restore after each test; vi.spyOn on the getter does not reliably
    // re-apply across tests. Probing is disabled on win32, so the
    // ancestor-walk/stty/tput tests pin POSIX and the win32 tests pin win32.
    const ORIGINAL_PLATFORM = process.platform;
    const setPlatform = (value: NodeJS.Platform): void => {
        Object.defineProperty(process, 'platform', { value, configurable: true, writable: true, enumerable: true });
    };
    const pinPosixPlatform = (): void => {
        setPlatform('darwin');
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        delete process.env.CCSTATUSLINE_WIDTH;
    });

    beforeEach(() => {
        resetTerminalWidthCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.CCSTATUSLINE_WIDTH;
        setPlatform(ORIGINAL_PLATFORM);
    });

    it('returns width from the immediate parent tty when available', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys001 size') {
                return '24 120\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBe(120);
        expect(mockExecFileSync.mock.calls.map(([file, args]) => `${file as string} ${(args as string[]).join(' ')}`)).toEqual([
            `ps -o ppid= -p ${process.pid}`,
            'ps -o tty= -p 1234',
            'stty -F /dev/ttys001 size'
        ]);
    });

    it('walks ancestor processes until it finds a valid tty', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return '??\n';
            }

            if (file === 'ps' && args.join(' ') === '-o ppid= -p 1234') {
                return '5678\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 5678') {
                return ' ttys009 \n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys009 size') {
                return '24 104\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBe(104);
    });

    it('falls back through stty variants when the first form returns no value', () => {
        pinPosixPlatform();
        // Simulates BSD/macOS, where `stty -F` exits with an error; `stty -f` succeeds.
        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return 'ttys003\n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys003 size') {
                throw new Error('stty: invalid argument');
            }

            if (file === 'stty' && args.join(' ') === '-f /dev/ttys003 size') {
                return '24 142\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBe(142);
    });

    it('falls back to tput cols when ancestor probing fails', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementationOnce(() => { throw new Error('ps unavailable'); });
        mockExecFileSync.mockReturnValueOnce('90\n');

        expect(getTerminalWidth()).toBe(90);
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('tput');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['cols']);
    });

    it('returns null when ancestor and fallback probes fail', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (file === 'stty') {
                return 'not-a-number not-a-number\n';
            }

            if (file === 'ps' && args.join(' ') === '-o ppid= -p 1234') {
                return '0\n';
            }

            if (file === 'tput') {
                throw new Error('tput unavailable');
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBeNull();
    });

    it('detects availability when an ancestor tty probe succeeds', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return '??\n';
            }

            if (file === 'ps' && args.join(' ') === '-o ppid= -p 1234') {
                return '5678\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 5678') {
                return 'ttys010\n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys010 size') {
                return '24 80\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(canDetectTerminalWidth()).toBe(true);
    });

    it('returns false for availability when all probes fail', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementationOnce(() => { throw new Error('tty unavailable'); });
        mockExecFileSync.mockImplementationOnce(() => { throw new Error('tput unavailable'); });

        expect(canDetectTerminalWidth()).toBe(false);
    });

    it('honors CCSTATUSLINE_WIDTH override before probing', () => {
        process.env.CCSTATUSLINE_WIDTH = '220';

        expect(getTerminalWidth()).toBe(220);
        expect(mockExecFileSync.mock.calls.length).toBe(0);
    });

    it('ignores a non-positive CCSTATUSLINE_WIDTH and falls back to probing', () => {
        pinPosixPlatform();
        process.env.CCSTATUSLINE_WIDTH = '0';

        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys001 size') {
                return '24 160\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBe(160);
    });

    it('ignores a non-numeric CCSTATUSLINE_WIDTH and falls back to probing', () => {
        pinPosixPlatform();
        process.env.CCSTATUSLINE_WIDTH = 'wide';

        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys001 size') {
                return '24 160\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBe(160);
    });

    it('CCSTATUSLINE_WIDTH override applies on Windows where probing is disabled', () => {
        setPlatform('win32');
        process.env.CCSTATUSLINE_WIDTH = '180';

        expect(getTerminalWidth()).toBe(180);
        expect(canDetectTerminalWidth()).toBe(true);
        expect(mockExecFileSync.mock.calls.length).toBe(0);
    });

    it('disables width detection on Windows', () => {
        setPlatform('win32');

        expect(getTerminalWidth()).toBeNull();
        expect(canDetectTerminalWidth()).toBe(false);
        expect(mockExecFileSync.mock.calls.length).toBe(0);
    });

    it('probes only once across repeated calls when a width is found', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'ps' && args.join(' ') === `-o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (file === 'ps' && args.join(' ') === '-o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (file === 'stty' && args.join(' ') === '-F /dev/ttys001 size') {
                return '24 120\n';
            }

            throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
        });

        expect(getTerminalWidth()).toBe(120);
        expect(getTerminalWidth()).toBe(120);
        expect(canDetectTerminalWidth()).toBe(true);

        const ppidProbes = mockExecFileSync.mock.calls.filter(
            call => call[0] === 'ps' && Array.isArray(call[1]) && (call[1])[1] === 'ppid='
        );
        expect(ppidProbes).toHaveLength(1);
    });

    // Regression test for the 113-spawn bug: Claude Code spawns the statusline with
    // no TTY, so the probe returns null. Callers use `context.terminalWidth ??
    // getTerminalWidth()`, so a memo that does not cache null re-probes forever.
    it('probes only once when NO tty is found (null is memoized)', () => {
        pinPosixPlatform();
        mockExecFileSync.mockImplementation(() => {
            throw new Error('no tty anywhere');
        });

        expect(getTerminalWidth()).toBeNull();
        expect(getTerminalWidth()).toBeNull();
        expect(getTerminalWidth()).toBeNull();
        expect(canDetectTerminalWidth()).toBe(false);

        const ppidProbes = mockExecFileSync.mock.calls.filter(
            call => call[0] === 'ps' && Array.isArray(call[1]) && (call[1])[1] === 'ppid='
        );
        expect(ppidProbes).toHaveLength(1);
    });

    it('resetTerminalWidthCache forces a re-probe', () => {
        pinPosixPlatform();
        process.env.CCSTATUSLINE_WIDTH = '150';
        expect(getTerminalWidth()).toBe(150);

        process.env.CCSTATUSLINE_WIDTH = '175';
        expect(getTerminalWidth()).toBe(150); // memoized, not re-read

        resetTerminalWidthCache();
        expect(getTerminalWidth()).toBe(175);
    });
});
