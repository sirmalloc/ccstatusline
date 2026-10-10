import { execFileSync } from 'node:child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import * as executablePath from '../executable-path';
import {
    getJjChangeCounts,
    isInsideJjRepo,
    runJjArgs
} from '../jj';

import { mockExecutableResolution } from './executable-path-test-helpers';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

mockExecutableResolution();

describe('jj utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('runJjArgs', () => {
        it('runs jj from its place on PATH, never the current directory', () => {
            const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(name => `C:\\tools\\${name}.exe`);
            try {
                mockExecFileSync.mockReturnValue('/repo\n');

                runJjArgs(['root'], { data: { cwd: 'C:\\repo' } });

                expect(resolve).toHaveBeenCalledWith('jj');
                expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('C:\\tools\\jj.exe');
            } finally {
                resolve.mockRestore();
            }
        });

        it('treats jj as missing when it isn\'t on PATH', () => {
            const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(() => {
                throw new Error('jj was not found on PATH');
            });
            try {
                expect(runJjArgs(['root'], { data: { cwd: 'C:\\repo' } })).toBeNull();
                expect(mockExecFileSync.mock.calls).toHaveLength(0);
            } finally {
                resolve.mockRestore();
            }
        });

        it('runs jj command with resolved cwd and trims trailing newlines', () => {
            mockExecFileSync.mockReturnValue('some-output\n');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            const result = runJjArgs(['log', '--limit', '1'], context);

            expect(result).toBe('some-output');
            expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
            expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['log', '--limit', '1']);
            expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 5_000,
                windowsHide: true,
                cwd: '/tmp/repo'
            });
        });

        it('runs jj command without cwd when no context directory exists', () => {
            mockExecFileSync.mockReturnValue('/tmp/repo\n');

            const result = runJjArgs(['root'], {});

            expect(result).toBe('/tmp/repo');
            expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 5_000,
                windowsHide: true
            });
        });

        it('returns null when output is empty', () => {
            mockExecFileSync.mockReturnValue('');

            expect(runJjArgs(['root'], {})).toBeNull();
        });

        it('returns empty string when allowEmpty is true and output is empty', () => {
            mockExecFileSync.mockReturnValue('');

            expect(runJjArgs(['log'], {}, true)).toBe('');
        });

        it('returns null when the command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(runJjArgs(['status'], {})).toBeNull();
        });
    });

    describe('isInsideJjRepo', () => {
        it('returns true when jj root succeeds', () => {
            mockExecFileSync.mockReturnValue('/tmp/repo\n');

            expect(isInsideJjRepo({})).toBe(true);
        });

        it('returns false when jj root fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(isInsideJjRepo({})).toBe(false);
        });
    });

    describe('getJjChangeCounts', () => {
        it('parses insertions and deletions from jj diff --stat', () => {
            mockExecFileSync.mockReturnValue('2 files changed, 5 insertions(+), 3 deletions(-)');

            expect(getJjChangeCounts({})).toEqual({
                insertions: 5,
                deletions: 3
            });
        });

        it('handles singular insertion/deletion forms', () => {
            mockExecFileSync.mockReturnValue('1 file changed, 1 insertion(+), 1 deletion(-)');

            expect(getJjChangeCounts({})).toEqual({
                insertions: 1,
                deletions: 1
            });
        });

        it('returns zero counts when jj diff --stat returns empty', () => {
            mockExecFileSync.mockReturnValue('');

            expect(getJjChangeCounts({})).toEqual({
                insertions: 0,
                deletions: 0
            });
        });

        it('returns zero counts when jj diff command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(getJjChangeCounts({})).toEqual({
                insertions: 0,
                deletions: 0
            });
        });
    });
});
