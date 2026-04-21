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
    getTerminalWidth
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

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns width from the immediate parent tty when available', () => {
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty size < /dev/ttys001 | awk '{print $2}'`) {
                return '120\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(120);
        expect(mockExecSync.mock.calls.map(([command]) => command)).toEqual([
            `ps -o ppid= -p ${process.pid}`,
            'ps -o tty= -p 1234',
            `stty size < /dev/ttys001 | awk '{print $2}'`
        ]);
    });

    it('walks ancestor processes until it finds a valid tty', () => {
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

            if (command === `stty size < /dev/ttys009 | awk '{print $2}'`) {
                return '104\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(getTerminalWidth()).toBe(104);
    });

    it('falls back to tput cols when ancestor probing fails', () => {
        mockExecSync.mockImplementationOnce(() => { throw new Error('ps unavailable'); });
        mockExecSync.mockReturnValueOnce('90\n');

        expect(getTerminalWidth()).toBe(90);
        expect(mockExecSync.mock.calls[1]?.[0]).toBe('tput cols 2>/dev/null');
    });

    it('returns null when ancestor and fallback probes fail', () => {
        mockExecSync.mockImplementation((command: string) => {
            if (command === `ps -o ppid= -p ${process.pid}`) {
                return '1234\n';
            }

            if (command === 'ps -o tty= -p 1234') {
                return 'ttys001\n';
            }

            if (command === `stty size < /dev/ttys001 | awk '{print $2}'`) {
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

            if (command === `stty size < /dev/ttys010 | awk '{print $2}'`) {
                return '80\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        expect(canDetectTerminalWidth()).toBe(true);
    });

    it('returns false for availability when all probes fail', () => {
        mockExecSync.mockImplementationOnce(() => { throw new Error('tty unavailable'); });
        mockExecSync.mockImplementationOnce(() => { throw new Error('tput unavailable'); });

        expect(canDetectTerminalWidth()).toBe(false);
    });

    it('disables width detection on Windows', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

        expect(getTerminalWidth()).toBeNull();
        expect(canDetectTerminalWidth()).toBe(false);
        expect(mockExecSync.mock.calls.length).toBe(0);
    });
});