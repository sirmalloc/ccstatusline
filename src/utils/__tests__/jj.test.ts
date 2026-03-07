import { execSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    getJjChangeCounts,
    getJjCurrentWorkspace,
    isInsideJjWorkspace,
    resolveJjCwd,
    runJj
} from '../jj';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

describe('jj utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('resolveJjCwd', () => {
        it('prefers context.data.cwd when available', () => {
            const context: RenderContext = {
                data: {
                    cwd: '/repo/from/cwd',
                    workspace: {
                        current_dir: '/repo/from/current-dir',
                        project_dir: '/repo/from/project-dir'
                    }
                }
            };

            expect(resolveJjCwd(context)).toBe('/repo/from/cwd');
        });

        it('falls back to workspace.current_dir', () => {
            const context: RenderContext = {
                data: {
                    workspace: {
                        current_dir: '/repo/from/current-dir',
                        project_dir: '/repo/from/project-dir'
                    }
                }
            };

            expect(resolveJjCwd(context)).toBe('/repo/from/current-dir');
        });

        it('falls back to workspace.project_dir', () => {
            const context: RenderContext = { data: { workspace: { project_dir: '/repo/from/project-dir' } } };

            expect(resolveJjCwd(context)).toBe('/repo/from/project-dir');
        });

        it('skips empty candidate values', () => {
            const context: RenderContext = {
                data: {
                    cwd: '   ',
                    workspace: {
                        current_dir: '',
                        project_dir: '/repo/from/project-dir'
                    }
                }
            };

            expect(resolveJjCwd(context)).toBe('/repo/from/project-dir');
        });

        it('returns undefined when no candidates are available', () => {
            expect(resolveJjCwd({})).toBeUndefined();
        });
    });

    describe('runJj', () => {
        it('runs jj command with resolved cwd and trims output', () => {
            mockExecSync.mockReturnValue(' some-output \n');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            const result = runJj('log --limit 1', context);

            expect(result).toBe('some-output');
            expect(mockExecSync.mock.calls[0]?.[0]).toBe('jj log --limit 1');
            expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                cwd: '/tmp/repo'
            });
        });

        it('runs jj command without cwd when no context directory exists', () => {
            mockExecSync.mockReturnValue('/tmp/repo\n');

            const result = runJj('workspace root', {});

            expect(result).toBe('/tmp/repo');
            expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        });

        it('returns null when output is empty', () => {
            mockExecSync.mockReturnValue('  \n');

            expect(runJj('workspace root', {})).toBeNull();
        });

        it('returns null when the command fails', () => {
            mockExecSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(runJj('status', {})).toBeNull();
        });
    });

    describe('isInsideJjWorkspace', () => {
        it('returns true when jj workspace root succeeds', () => {
            mockExecSync.mockReturnValue('/tmp/repo\n');

            expect(isInsideJjWorkspace({})).toBe(true);
        });

        it('returns false when jj workspace root fails', () => {
            mockExecSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(isInsideJjWorkspace({})).toBe(false);
        });
    });

    describe('getJjCurrentWorkspace', () => {
        it('returns the workspace name from the first line', () => {
            mockExecSync.mockReturnValue('default: kpqxywon 2f73e05c (no description set)\nfeature-work: spzqtmlo abc12345 (no description set)');

            expect(getJjCurrentWorkspace({})).toBe('default');
        });

        it('returns non-default workspace name', () => {
            mockExecSync.mockReturnValue('feature-work: spzqtmlo abc12345 (no description set)');

            expect(getJjCurrentWorkspace({})).toBe('feature-work');
        });

        it('returns null when command fails', () => {
            mockExecSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(getJjCurrentWorkspace({})).toBeNull();
        });

        it('returns null when output is empty', () => {
            mockExecSync.mockReturnValue('  \n');

            expect(getJjCurrentWorkspace({})).toBeNull();
        });
    });

    describe('getJjChangeCounts', () => {
        it('parses insertions and deletions from jj diff --stat', () => {
            mockExecSync.mockReturnValue('2 files changed, 5 insertions(+), 3 deletions(-)');

            expect(getJjChangeCounts({})).toEqual({
                insertions: 5,
                deletions: 3
            });
        });

        it('handles singular insertion/deletion forms', () => {
            mockExecSync.mockReturnValue('1 file changed, 1 insertion(+), 1 deletion(-)');

            expect(getJjChangeCounts({})).toEqual({
                insertions: 1,
                deletions: 1
            });
        });

        it('returns zero counts when jj diff --stat returns empty', () => {
            mockExecSync.mockReturnValue('\n');

            expect(getJjChangeCounts({})).toEqual({
                insertions: 0,
                deletions: 0
            });
        });

        it('returns zero counts when jj diff command fails', () => {
            mockExecSync.mockImplementation(() => { throw new Error('jj failed'); });

            expect(getJjChangeCounts({})).toEqual({
                insertions: 0,
                deletions: 0
            });
        });
    });
});