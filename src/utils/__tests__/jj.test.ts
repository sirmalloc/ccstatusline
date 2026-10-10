import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import * as executablePath from '../executable-path';
import { clearGitCache } from '../git';
import {
    getJjChangeCounts,
    isInsideJjRepo,
    runJjArgs
} from '../jj';

import { mockExecutableResolution } from './executable-path-test-helpers';
import { useJjTestWorkspace } from './jj-test-helpers';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

const workspace = useJjTestWorkspace();

function repoContext(): RenderContext {
    return { data: { cwd: workspace.root } };
}

function touch(filePath: string, mtimeMs: number): void {
    const date = new Date(mtimeMs);
    fs.utimesSync(filePath, date, date);
}

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

        it('runs jj command with resolved cwd, timeout and trims trailing newlines', () => {
            mockExecFileSync.mockReturnValue('some-output\n');

            const result = runJjArgs(['log', '--limit', '1'], repoContext());

            expect(result).toBe('some-output');
            expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
            expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['log', '--limit', '1']);
            expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 5_000,
                windowsHide: true,
                cwd: workspace.root
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

            expect(runJjArgs(['root'], repoContext())).toBeNull();
        });

        it('returns empty string when allowEmpty is true and output is empty', () => {
            mockExecFileSync.mockReturnValue('');

            expect(runJjArgs(['log'], repoContext(), true)).toBe('');
        });

        it('does not share cache entries between allowEmpty modes', () => {
            mockExecFileSync.mockReturnValue('');

            expect(runJjArgs(['log'], repoContext())).toBeNull();
            expect(runJjArgs(['log'], repoContext(), true)).toBe('');
        });

        it('returns null when the command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(runJjArgs(['status'], repoContext())).toBeNull();
        });
    });

    describe('caching', () => {
        it('reuses in-process results for repeated commands', () => {
            mockExecFileSync.mockReturnValueOnce('abc\n');

            expect(runJjArgs(['log'], repoContext())).toBe('abc');
            expect(runJjArgs(['log'], repoContext())).toBe('abc');
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('reuses persisted results across processes', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            mockExecFileSync.mockReturnValueOnce('abc\n');

            expect(runJjArgs(['log'], repoContext())).toBe('abc');
            clearGitCache();
            expect(runJjArgs(['log'], repoContext())).toBe('abc');
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
            expect(fs.readdirSync(path.join(workspace.home, '.cache', 'ccstatusline', 'jj-cache'))).toHaveLength(1);
        });

        it('caches failures', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(runJjArgs(['log'], repoContext())).toBeNull();
            clearGitCache();
            expect(runJjArgs(['log'], repoContext())).toBeNull();
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('expires entries after the configured TTL', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            mockExecFileSync.mockReturnValueOnce('old\n');
            expect(runJjArgs(['log'], repoContext())).toBe('old');

            nowSpy.mockReturnValue(7000);
            mockExecFileSync.mockReturnValueOnce('new\n');
            expect(runJjArgs(['log'], repoContext())).toBe('new');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
        });

        it.each([
            ['a new operation head', () => workspace.opHeadsPath],
            ['a working-copy checkout update', () => workspace.checkoutPath]
        ])('invalidates entries on %s', (_label, getPath) => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            touch(getPath(), 1_000_000);
            mockExecFileSync.mockReturnValueOnce('old\n');
            expect(runJjArgs(['log'], repoContext())).toBe('old');

            touch(getPath(), 2_000_000);
            mockExecFileSync.mockReturnValueOnce('new\n');
            expect(runJjArgs(['log'], repoContext())).toBe('new');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
        });

        it('keys snapshotting commands to the repo state after they ran', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            touch(workspace.opHeadsPath, 1_000_000);
            mockExecFileSync.mockImplementation((() => {
                // `jj diff` records a working-copy snapshot operation.
                touch(workspace.opHeadsPath, 2_000_000);
                return '1 file changed, 1 insertion(+)\n';
            }) as () => never);

            expect(runJjArgs(['diff', '--stat'], repoContext())).toBe('1 file changed, 1 insertion(+)');
            clearGitCache();
            expect(runJjArgs(['diff', '--stat'], repoContext())).toBe('1 file changed, 1 insertion(+)');
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('keys read-only commands to the repo state before they ran', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            touch(workspace.opHeadsPath, 1_000_000);
            mockExecFileSync.mockImplementation((() => {
                // Another jj process records an operation concurrently.
                touch(workspace.opHeadsPath, 2_000_000);
                return 'old\n';
            }) as () => never);

            expect(runJjArgs(['log', '--ignore-working-copy'], repoContext())).toBe('old');
            clearGitCache();
            expect(runJjArgs(['log', '--ignore-working-copy'], repoContext())).toBe('old');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
        });

        it('tracks the shared repo of a secondary workspace', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const secondary = fs.mkdtempSync(path.join(workspace.home, 'secondary-'));
            fs.mkdirSync(path.join(secondary, '.jj', 'working_copy'), { recursive: true });
            fs.writeFileSync(path.join(secondary, '.jj', 'working_copy', 'checkout'), '', 'utf-8');
            fs.writeFileSync(path.join(secondary, '.jj', 'repo'), path.join(workspace.root, '.jj', 'repo'), 'utf-8');
            const context: RenderContext = { data: { cwd: secondary } };

            touch(workspace.opHeadsPath, 1_000_000);
            mockExecFileSync.mockReturnValueOnce('old\n');
            expect(runJjArgs(['log'], context)).toBe('old');

            touch(workspace.opHeadsPath, 2_000_000);
            mockExecFileSync.mockReturnValueOnce('new\n');
            expect(runJjArgs(['log'], context)).toBe('new');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
        });
    });

    describe('isInsideJjRepo', () => {
        it('returns true when jj root succeeds', () => {
            mockExecFileSync.mockReturnValue('/tmp/repo\n');

            expect(isInsideJjRepo(repoContext())).toBe(true);
        });

        it('finds the workspace from a subdirectory', () => {
            const subdir = path.join(workspace.root, 'src', 'nested');
            fs.mkdirSync(subdir, { recursive: true });
            mockExecFileSync.mockReturnValue('/tmp/repo\n');

            expect(isInsideJjRepo({ data: { cwd: subdir } })).toBe(true);
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('returns false when jj root fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(isInsideJjRepo(repoContext())).toBe(false);
        });

        it('returns false without spawning jj when no .jj directory exists', () => {
            mockExecFileSync.mockReturnValue('/tmp/repo\n');

            expect(isInsideJjRepo({ data: { cwd: workspace.home } })).toBe(false);
            expect(mockExecFileSync.mock.calls).toHaveLength(0);
        });
    });

    describe('getJjChangeCounts', () => {
        it('parses insertions and deletions from jj diff --stat', () => {
            mockExecFileSync.mockReturnValue('2 files changed, 5 insertions(+), 3 deletions(-)');

            expect(getJjChangeCounts(repoContext())).toEqual({
                insertions: 5,
                deletions: 3
            });
        });

        it('handles singular insertion/deletion forms', () => {
            mockExecFileSync.mockReturnValue('1 file changed, 1 insertion(+), 1 deletion(-)');

            expect(getJjChangeCounts(repoContext())).toEqual({
                insertions: 1,
                deletions: 1
            });
        });

        it('returns zero counts when jj diff --stat returns empty', () => {
            mockExecFileSync.mockReturnValue('');

            expect(getJjChangeCounts(repoContext())).toEqual({
                insertions: 0,
                deletions: 0
            });
        });

        it('returns zero counts when jj diff command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(getJjChangeCounts(repoContext())).toEqual({
                insertions: 0,
                deletions: 0
            });
        });
    });
});
