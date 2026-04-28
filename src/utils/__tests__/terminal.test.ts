import {
    execSync,
    spawnSync
} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

function clearWindowsWidthCache(): void {
    try {
        const dir = os.tmpdir();
        for (const file of fs.readdirSync(dir)) {
            if (file.startsWith('ccstatusline-win-width-') && file.endsWith('.json')) {
                fs.rmSync(path.join(dir, file), { force: true });
            }
        }
    } catch {
        // ignore
    }
}

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
        // Default to the Unix probe path for all tests that don't explicitly
        // override `process.platform`. The Windows path uses a completely
        // different mechanism (PowerShell probe) and is covered below.
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
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

    describe('Windows width detection', () => {
        interface SpawnResult { status: number; stdout: string; stderr: string }
        const mockSpawnSync = spawnSync as unknown as {
            mock: { calls: unknown[][] };
            mockImplementation: (impl: (cmd: string, args: string[], opts?: unknown) => SpawnResult) => void;
            mockImplementationOnce: (impl: () => never) => void;
        };

        beforeEach(() => {
            vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
            clearWindowsWidthCache();
        });

        afterEach(() => {
            clearWindowsWidthCache();
        });

        it('parses a width from the PowerShell probe output', () => {
            mockSpawnSync.mockImplementation(() => ({ status: 0, stdout: '209\n', stderr: '' }));

            expect(getTerminalWidth()).toBe(209);
            expect(mockSpawnSync.mock.calls.length).toBe(1);
            const [cmd, args] = mockSpawnSync.mock.calls[0] as [string, string[]];
            expect(cmd).toBe('powershell.exe');
            const encodedIndex = args.indexOf('-EncodedCommand');
            expect(encodedIndex).toBeGreaterThanOrEqual(0);
            const decoded = Buffer.from(args[encodedIndex + 1] ?? '', 'base64').toString('utf16le');
            // Guards against regressions where the script is silently
            // replaced or gutted during a refactor. The probe must
            // enumerate processes (Get-CimInstance Win32_Process) and
            // attach to each ancestor's console to read its width
            // (AttachConsole + GetConsoleScreenBufferInfo).
            expect(decoded).toContain('Get-CimInstance');
            expect(decoded).toContain('Win32_Process');
            expect(decoded).toContain('AttachConsole');
            expect(decoded).toContain('GetConsoleScreenBufferInfo');
        });

        it('returns null when no ancestor has an attachable console', () => {
            mockSpawnSync.mockImplementation(() => ({ status: 0, stdout: '\n', stderr: '' }));

            expect(getTerminalWidth()).toBeNull();
        });

        it('returns null when the probe exits non-zero', () => {
            mockSpawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'oops' }));

            expect(getTerminalWidth()).toBeNull();
        });

        it('returns null when spawnSync throws', () => {
            mockSpawnSync.mockImplementationOnce(() => { throw new Error('pwsh missing'); });

            expect(getTerminalWidth()).toBeNull();
        });

        it('serves a fresh cached width without spawning PowerShell again', () => {
            mockSpawnSync.mockImplementation(() => ({ status: 0, stdout: '209\n', stderr: '' }));

            expect(getTerminalWidth()).toBe(209);
            expect(mockSpawnSync.mock.calls.length).toBe(1);

            expect(getTerminalWidth()).toBe(209);
            expect(mockSpawnSync.mock.calls.length).toBe(1);
        });

        it('does not fall through to the Unix ps/stty probes on Windows', () => {
            mockSpawnSync.mockImplementation(() => ({ status: 0, stdout: '120\n', stderr: '' }));

            expect(canDetectTerminalWidth()).toBe(true);
            expect(mockExecSync.mock.calls.length).toBe(0);
        });
    });
});
