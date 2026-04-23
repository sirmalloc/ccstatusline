import { execFileSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    clearGitCache,
    getGitChangeCounts,
    getGitStatus,
    isInsideGitWorkTree,
    resolveGitCwd,
    runGit
} from '../git';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

describe('git utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
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
        it('runs git command with resolved cwd and trims trailing whitespace', () => {
            mockExecFileSync.mockReturnValueOnce('feature/worktree\n');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            const result = runGit('branch --show-current', context);

            expect(result).toBe('feature/worktree');
            expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('git');
            expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['branch', '--show-current']);
            expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                cwd: '/tmp/repo'
            });
        });

        it('runs git command without cwd when no context directory exists', () => {
            mockExecFileSync.mockReturnValueOnce('true\n');

            const result = runGit('rev-parse --is-inside-work-tree', {});

            expect(result).toBe('true');
            expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        });

        it('returns null when the command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(runGit('status --short', {})).toBeNull();
        });
    });

    describe('isInsideGitWorkTree', () => {
        it('returns true when git reports true', () => {
            mockExecFileSync.mockReturnValueOnce('true\n');

            expect(isInsideGitWorkTree({})).toBe(true);
        });

        it('returns false when git reports false', () => {
            mockExecFileSync.mockReturnValueOnce('false\n');

            expect(isInsideGitWorkTree({})).toBe(false);
        });

        it('returns false when git command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(isInsideGitWorkTree({})).toBe(false);
        });
    });

    describe('getGitChangeCounts', () => {
        it('sums staged and unstaged insertions/deletions', () => {
            mockExecFileSync.mockReturnValueOnce('1 file changed, 2 insertions(+), 1 deletion(-)');
            mockExecFileSync.mockReturnValueOnce('1 file changed, 3 insertions(+), 4 deletions(-)');

            expect(getGitChangeCounts({})).toEqual({
                insertions: 5,
                deletions: 5
            });
        });

        it('handles singular insertion/deletion forms', () => {
            mockExecFileSync.mockReturnValueOnce('1 file changed, 1 insertion(+), 1 deletion(-)');
            mockExecFileSync.mockReturnValueOnce('');

            expect(getGitChangeCounts({})).toEqual({
                insertions: 1,
                deletions: 1
            });
        });

        it('returns zero counts when git diff commands fail', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(getGitChangeCounts({})).toEqual({
                insertions: 0,
                deletions: 0
            });
        });
    });

    describe('getGitStatus', () => {
        it('returns all false when no git output', () => {
            mockExecFileSync.mockReturnValueOnce('');

            expect(getGitStatus({})).toEqual({
                staged: false,
                unstaged: false,
                untracked: false,
                conflicts: false
            });
        });

        it('detects staged modification', () => {
            mockExecFileSync.mockReturnValueOnce('M  file.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('detects unstaged modification', () => {
            mockExecFileSync.mockReturnValueOnce(' M file.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(false);
            expect(result.unstaged).toBe(true);
            expect(result.conflicts).toBe(false);
        });

        it('detects both staged and unstaged modification', () => {
            mockExecFileSync.mockReturnValueOnce('MM file.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
            expect(result.conflicts).toBe(false);
        });

        it('detects unstaged deletion', () => {
            mockExecFileSync.mockReturnValueOnce(' D file.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(false);
            expect(result.unstaged).toBe(true);
            expect(result.conflicts).toBe(false);
        });

        it('detects staged deletion', () => {
            mockExecFileSync.mockReturnValueOnce('D  file.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('detects untracked files', () => {
            mockExecFileSync.mockReturnValueOnce('?? newfile.txt');

            const result = getGitStatus({});
            expect(result.untracked).toBe(true);
            expect(result.staged).toBe(false);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('detects merge conflict: both modified (UU)', () => {
            mockExecFileSync.mockReturnValueOnce('UU file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects merge conflict: added by us (AU)', () => {
            mockExecFileSync.mockReturnValueOnce('AU file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects merge conflict: deleted by us (DU)', () => {
            mockExecFileSync.mockReturnValueOnce('DU file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects merge conflict: both added (AA)', () => {
            mockExecFileSync.mockReturnValueOnce('AA file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects merge conflict: added by them (UA)', () => {
            mockExecFileSync.mockReturnValueOnce('UA file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects merge conflict: deleted by them (UD)', () => {
            mockExecFileSync.mockReturnValueOnce('UD file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects merge conflict: both deleted (DD)', () => {
            mockExecFileSync.mockReturnValueOnce('DD file.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
        });

        it('detects renamed file in index (staged)', () => {
            mockExecFileSync.mockReturnValueOnce('R  oldname.txt -> newname.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('detects copied file in index (staged)', () => {
            mockExecFileSync.mockReturnValueOnce('C  original.txt -> copy.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('ignores rename source path in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce('R  new-name.txt\0DUCK.txt\0');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('ignores copy source path in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce('C  copy.txt\0MOUSE.txt\0');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('detects type changed file in index (staged)', () => {
            mockExecFileSync.mockReturnValueOnce('T  file.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(false);
            expect(result.conflicts).toBe(false);
        });

        it('detects mixed status with multiple files', () => {
            mockExecFileSync.mockReturnValueOnce('M  staged.txt\0 M unstaged.txt\0?? untracked.txt');

            const result = getGitStatus({});
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
            expect(result.untracked).toBe(true);
            expect(result.conflicts).toBe(false);
        });

        it('detects mixed status with conflicts', () => {
            mockExecFileSync.mockReturnValueOnce('UU conflict.txt\0M  staged.txt\0 M unstaged.txt\0?? untracked.txt');

            const result = getGitStatus({});
            expect(result.conflicts).toBe(true);
            expect(result.staged).toBe(true);
            expect(result.unstaged).toBe(true);
            expect(result.untracked).toBe(true);
        });

        it('handles git command failure', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(getGitStatus({})).toEqual({
                staged: false,
                unstaged: false,
                untracked: false,
                conflicts: false
            });
        });
    });
});
