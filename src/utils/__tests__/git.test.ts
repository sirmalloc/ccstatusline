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
    isInsideGitWorkTree,
    resolveGitCwd,
    runGit
} from '../git';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
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
});