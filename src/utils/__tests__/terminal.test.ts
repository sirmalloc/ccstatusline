import { execSync } from 'child_process';
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
    const mockExecSync = execSync as unknown as {
        mock: { calls: unknown[][] };
        mockImplementation: (impl: (command: string) => string) => void;
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
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty -F /dev/ttys001 size 2>/dev/null | awk '{print $2}'`) {
                return '120\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(120);
        expect(mockExecSync.mock.calls.map(([command]) => command)).toEqual([
            `ps -o ppid= -p ${process.pid}`,
            'ps -o tty= -p 1234',
            `stty -F /dev/ttys001 size 2>/dev/null | awk '{print $2}'`
        ]);
    });

    it('walks ancestor processes until it finds a valid tty', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return '??\n';
            }

            if (command === 'ps -o ppid= -p 1234') {
                return '5678\n';
            }

            if (command === 'ps -o tty= -p 5678') {
                return ' ttys009 \n';
            }

            if (command === `stty -F /dev/ttys009 size 2>/dev/null | awk '{print $2}'`) {
                return '104\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(104);
    });

    it('falls back through stty variants when the first form returns no value', () => {
        pinPosixPlatform();
        // Simulates BSD/macOS, where `stty -F` exits with an error and yields
        // empty output via the `2>/dev/null | awk` pipeline; `stty -f` succeeds.
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys003\n';
            }

            if (command === `stty -F /dev/ttys003 size 2>/dev/null | awk '{print $2}'`) {
                return '\n';
            }

            if (command === `stty -f /dev/ttys003 size 2>/dev/null | awk '{print $2}'`) {
                return '142\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(142);
    });

    it('falls back to tput cols when ancestor probing fails', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementationOnce(() => { throw new Error('ps unavailable'); });
        mockExecSync.mockReturnValueOnce('90\n');

        expect(getTerminalWidth()).toBe(90);
        expect(mockExecSync.mock.calls[1]?.[0]).toBe('tput cols 2>/dev/null');
    });

    it('returns null when ancestor and fallback probes fail', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty -F /dev/ttys001 size 2>/dev/null | awk '{print $2}'`
                || command === `stty -f /dev/ttys001 size 2>/dev/null | awk '{print $2}'`
                || command === `stty size < /dev/ttys001 2>/dev/null | awk '{print $2}'`) {
                return 'not-a-number\n';
            }

            if (command === 'ps -o ppid= -p 1234') {
                return '0\n';
            }

            if (command === 'tput cols 2>/dev/null') {
                throw new Error('tput unavailable');
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBeNull();
    });

    it('detects availability when an ancestor tty probe succeeds', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return '??\n';
            }

            if (command === 'ps -o ppid= -p 1234') {
                return '5678\n';
            }

            if (command === 'ps -o tty= -p 5678') {
                return 'ttys010\n';
            }

            if (command === `stty -F /dev/ttys010 size 2>/dev/null | awk '{print $2}'`) {
                return '80\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(canDetectTerminalWidth()).toBe(true);
    });

    it('returns false for availability when all probes fail', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementationOnce(() => { throw new Error('tty unavailable'); });
        mockExecSync.mockImplementationOnce(() => { throw new Error('tput unavailable'); });

        expect(canDetectTerminalWidth()).toBe(false);
    });

    it('honors CCSTATUSLINE_WIDTH override before probing', () => {
        process.env.CCSTATUSLINE_WIDTH = '220';

        expect(getTerminalWidth()).toBe(220);
        expect(mockExecSync.mock.calls.length).toBe(0);
    });

    it('ignores a non-positive CCSTATUSLINE_WIDTH and falls back to probing', () => {
        pinPosixPlatform();
        process.env.CCSTATUSLINE_WIDTH = '0';

        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty -F /dev/ttys001 size 2>/dev/null | awk '{print $2}'`) {
                return '160\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(160);
    });

    it('ignores a non-numeric CCSTATUSLINE_WIDTH and falls back to probing', () => {
        pinPosixPlatform();
        process.env.CCSTATUSLINE_WIDTH = 'wide';

        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty -F /dev/ttys001 size 2>/dev/null | awk '{print $2}'`) {
                return '160\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(160);
    });

    it('CCSTATUSLINE_WIDTH override applies on Windows where probing is disabled', () => {
        setPlatform('win32');
        process.env.CCSTATUSLINE_WIDTH = '180';

        expect(getTerminalWidth()).toBe(180);
        expect(canDetectTerminalWidth()).toBe(true);
        expect(mockExecSync.mock.calls.length).toBe(0);
    });

    it('disables width detection on Windows', () => {
        setPlatform('win32');

        expect(getTerminalWidth()).toBeNull();
        expect(canDetectTerminalWidth()).toBe(false);
        expect(mockExecSync.mock.calls.length).toBe(0);
    });

    it('probes only once across repeated calls when a width is found', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty -F /dev/ttys001 size 2>/dev/null | awk '{print $2}'`) {
                return '120\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(120);
        expect(getTerminalWidth()).toBe(120);
        expect(canDetectTerminalWidth()).toBe(true);

        const ppidProbes = mockExecSync.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].startsWith('ps -o ppid=')
        );
        expect(ppidProbes).toHaveLength(1);
    });

    // Regression test for the 113-spawn bug: Claude Code spawns the statusline with
    // no TTY, so the probe returns null. Callers use `context.terminalWidth ??
    // getTerminalWidth()`, so a memo that does not cache null re-probes forever.
    it('probes only once when NO tty is found (null is memoized)', () => {
        pinPosixPlatform();
        mockExecSync.mockImplementation(() => {
            throw new Error('no tty anywhere');
        });

        expect(getTerminalWidth()).toBeNull();
        expect(getTerminalWidth()).toBeNull();
        expect(getTerminalWidth()).toBeNull();
        expect(canDetectTerminalWidth()).toBe(false);

        const ppidProbes = mockExecSync.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].startsWith('ps -o ppid=')
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
