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
    getGitChangeCounts,
    getGitFileStatusCounts,
    isInsideGitWorkTree,
    resolveGitCwd,
    runGit
} from '../git';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

describe('git utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('resolveGitCwd', () => {
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

            expect(resolveGitCwd(context)).toBe('/repo/from/cwd');
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

            expect(resolveGitCwd(context)).toBe('/repo/from/current-dir');
        });

        it('falls back to workspace.project_dir', () => {
            const context: RenderContext = { data: { workspace: { project_dir: '/repo/from/project-dir' } } };

            expect(resolveGitCwd(context)).toBe('/repo/from/project-dir');
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

            expect(resolveGitCwd(context)).toBe('/repo/from/project-dir');
        });

        it('returns undefined when no candidates are available', () => {
            expect(resolveGitCwd({})).toBeUndefined();
        });
    });

    describe('runGit', () => {
        it('runs git command with resolved cwd and trims output', () => {
            mockExecSync.mockReturnValue(' feature/worktree \n');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            const result = runGit('branch --show-current', context);

            expect(result).toBe('feature/worktree');
            expect(mockExecSync.mock.calls[0]?.[0]).toBe('git branch --show-current');
            expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                cwd: '/tmp/repo'
            });
        });

        it('runs git command without cwd when no context directory exists', () => {
            mockExecSync.mockReturnValue('true\n');

            const result = runGit('rev-parse --is-inside-work-tree', {});

            expect(result).toBe('true');
            expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        });

        it('returns null when the command fails', () => {
            mockExecSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(runGit('status --short', {})).toBeNull();
        });
    });

    describe('isInsideGitWorkTree', () => {
        it('returns true when git reports true', () => {
            mockExecSync.mockReturnValue('true\n');

            expect(isInsideGitWorkTree({})).toBe(true);
        });

        it('returns false when git reports false', () => {
            mockExecSync.mockReturnValue('false\n');

            expect(isInsideGitWorkTree({})).toBe(false);
        });

        it('returns false when git command fails', () => {
            mockExecSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(isInsideGitWorkTree({})).toBe(false);
        });
    });

    describe('getGitChangeCounts', () => {
        it('sums staged and unstaged insertions/deletions', () => {
            mockExecSync.mockReturnValueOnce('1 file changed, 2 insertions(+), 1 deletion(-)');
            mockExecSync.mockReturnValueOnce('1 file changed, 3 insertions(+), 4 deletions(-)');

            expect(getGitChangeCounts({})).toEqual({
                insertions: 5,
                deletions: 5
            });
        });

        it('handles singular insertion/deletion forms', () => {
            mockExecSync.mockReturnValueOnce('1 file changed, 1 insertion(+), 1 deletion(-)');
            mockExecSync.mockReturnValueOnce('');

            expect(getGitChangeCounts({})).toEqual({
                insertions: 1,
                deletions: 1
            });
        });

        it('returns zero counts when git diff commands fail', () => {
            mockExecSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(getGitChangeCounts({})).toEqual({
                insertions: 0,
                deletions: 0
            });
        });
    });

    describe('getGitFileStatusCounts', () => {
        it('counts staged, unstaged, and untracked files', () => {
            mockExecSync.mockReturnValueOnce('staged-a\nstaged-b\n');
            mockExecSync.mockReturnValueOnce('unstaged-a');
            mockExecSync.mockReturnValueOnce('new-a\nnew-b\nnew-c\n');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 2,
                unstaged: 1,
                untracked: 3
            });
        });

        it('returns zero counts when there are no matching files', () => {
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 0,
                unstaged: 0,
                untracked: 0
            });
        });

        it('returns zero counts when git commands fail', () => {
            mockExecSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 0,
                unstaged: 0,
                untracked: 0
            });
        });
    });
});