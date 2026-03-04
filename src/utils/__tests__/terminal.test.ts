import { execSync } from 'child_process';
import {
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

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementationOnce: (impl: () => never) => void;
    mockReturnValueOnce: (value: string) => void;
};

describe('terminal utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('returns width from tty probe when available', () => {
        mockExecSync.mockReturnValueOnce('ttys001\n');
        mockExecSync.mockReturnValueOnce('120\n');

        expect(getTerminalWidth()).toBe(120);
        expect(mockExecSync.mock.calls[0]?.[0]).toContain('ps -o tty=');
        expect(mockExecSync.mock.calls[1]?.[0]).toContain('stty size < /dev/ttys001');
    });

    it('falls back to tput cols when tty probe fails', () => {
        mockExecSync.mockImplementationOnce(() => { throw new Error('tty unavailable'); });
        mockExecSync.mockReturnValueOnce('90\n');

        expect(getTerminalWidth()).toBe(90);
        expect(mockExecSync.mock.calls[1]?.[0]).toBe('tput cols 2>/dev/null');
    });

    it('returns null when width probes fail', () => {
        mockExecSync.mockReturnValueOnce('ttys001\n');
        mockExecSync.mockReturnValueOnce('not-a-number\n');
        mockExecSync.mockImplementationOnce(() => { throw new Error('tput unavailable'); });

        expect(getTerminalWidth()).toBeNull();
    });

    it('detects availability when tty probe succeeds', () => {
        mockExecSync.mockReturnValueOnce('ttys001\n');
        mockExecSync.mockReturnValueOnce('80\n');

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