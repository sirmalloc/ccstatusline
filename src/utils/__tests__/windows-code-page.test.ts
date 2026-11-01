import { execFileSync } from 'node:child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import * as executablePath from '../executable-path';
import { ensureWindowsUtf8CodePage } from '../windows-code-page';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
};

describe('ensureWindowsUtf8CodePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('runs chcp from its place on PATH, never the current directory', () => {
        const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(name => `C:\\Windows\\System32\\${name}`);
        try {
            ensureWindowsUtf8CodePage('win32');

            expect(resolve).toHaveBeenCalledWith('chcp.com');
            expect(mockExecFileSync.mock.calls[0]?.slice(0, 2)).toEqual(['C:\\Windows\\System32\\chcp.com', ['65001']]);
        } finally {
            resolve.mockRestore();
        }
    });

    it('does nothing outside Windows', () => {
        ensureWindowsUtf8CodePage('darwin');

        expect(mockExecFileSync.mock.calls).toHaveLength(0);
    });

    it('carries on when chcp isn\'t found or fails', () => {
        const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(() => {
            throw new Error('chcp.com was not found on PATH');
        });
        try {
            expect(() => {
                ensureWindowsUtf8CodePage('win32');
            }).not.toThrow();
            expect(mockExecFileSync.mock.calls).toHaveLength(0);
        } finally {
            resolve.mockRestore();
        }
    });
});
