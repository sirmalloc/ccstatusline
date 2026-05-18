import { execFileSync } from 'child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
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
    getGitFileStatusCounts,
    getGitStatus,
    isInsideGitWorkTree,
    resolveGitCwd,
    runGit
} from '../git';

import { expectGitExecOptions } from './git-test-helpers';

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

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const tempPaths: string[] = [];

function useTempHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-home-'));
    tempPaths.push(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    return home;
}

function createGitRepo(): { root: string; headPath: string; indexPath: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-repo-'));
    tempPaths.push(root);
    const gitDir = path.join(root, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    const headPath = path.join(gitDir, 'HEAD');
    const indexPath = path.join(gitDir, 'index');
    fs.writeFileSync(headPath, 'ref: refs/heads/main\n', 'utf-8');
    fs.writeFileSync(indexPath, '', 'utf-8');
    return { root, headPath, indexPath };
}

function touch(filePath: string, mtimeMs: number): void {
    const date = new Date(mtimeMs);
    fs.utimesSync(filePath, date, date);
}

function getOnlyGitCachePath(home: string): string {
    const cacheDir = path.join(home, '.cache', 'ccstatusline', 'git-cache');
    const files = fs.readdirSync(cacheDir).filter(file => /^git-[a-f0-9]+\.json$/.test(file));
    expect(files).toHaveLength(1);
    return path.join(cacheDir, files[0] ?? '');
}

function readGitCacheJson(home: string): { cwd?: unknown; entries?: Record<string, unknown> } {
    return JSON.parse(fs.readFileSync(getOnlyGitCachePath(home), 'utf-8')) as {
        cwd?: unknown;
        entries?: Record<string, unknown>;
    };
}

describe('git utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    afterEach(() => {
        clearGitCache();
        vi.restoreAllMocks();
        if (ORIGINAL_HOME === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = ORIGINAL_HOME;
        }
        if (ORIGINAL_USERPROFILE === undefined) {
            delete process.env.USERPROFILE;
        } else {
            process.env.USERPROFILE = ORIGINAL_USERPROFILE;
        }

        while (tempPaths.length > 0) {
            const tempPath = tempPaths.pop();
            if (tempPath) {
                fs.rmSync(tempPath, { recursive: true, force: true });
            }
        }
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

            const result = runGit('symbolic-ref --short HEAD', context);

            expect(result).toBe('feature/worktree');
            expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('git');
            expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['symbolic-ref', '--short', 'HEAD']);
            expectGitExecOptions(mockExecFileSync.mock.calls[0]?.[2], '/tmp/repo');
        });

        it('runs git command without cwd when no context directory exists', () => {
            mockExecFileSync.mockReturnValueOnce('true\n');

            const result = runGit('rev-parse --is-inside-work-tree', {});

            expect(result).toBe('true');
            expectGitExecOptions(mockExecFileSync.mock.calls[0]?.[2]);
        });

        it('returns null when the command fails', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(runGit('status --short', {})).toBeNull();
        });

        it('reuses in-process cache entries while repo mtimes and TTL remain valid', () => {
            useTempHome();
            const { root } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 5 };
            mockExecFileSync.mockReturnValueOnce('feature/cache\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('feature/cache');
            expect(runGit('symbolic-ref --short HEAD', context)).toBe('feature/cache');

            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('reuses valid persistent cache entries after in-process cache is cleared', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            const { root } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 5 };
            mockExecFileSync.mockReturnValueOnce('feature/persisted\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('feature/persisted');
            expect(fs.existsSync(getOnlyGitCachePath(home))).toBe(true);

            clearGitCache();
            expect(runGit('symbolic-ref --short HEAD', context)).toBe('feature/persisted');
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('stores cwd once and uses command-only persistent cache keys', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            const { root } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 5 };
            mockExecFileSync.mockReturnValueOnce('1 file changed, 2 insertions(+)');

            expect(runGit('diff --cached --shortstat', context)).toBe('1 file changed, 2 insertions(+)');

            const cache = readGitCacheJson(home);
            expect(cache.cwd).toBe(root);
            expect(Object.keys(cache.entries ?? {})).toEqual(['diff --cached --shortstat']);
        });

        it('expires persistent cache entries older than the configured TTL', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            useTempHome();
            const { root } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 5 };
            mockExecFileSync.mockReturnValueOnce('old-value\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('old-value');

            clearGitCache();
            nowSpy.mockReturnValue(7000);
            mockExecFileSync.mockReturnValueOnce('new-value\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('new-value');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
        });

        it('keeps persistent cache entries when TTL is zero and repo mtimes match', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            useTempHome();
            const { root } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 0 };
            mockExecFileSync.mockReturnValueOnce('old-value\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('old-value');

            clearGitCache();
            nowSpy.mockReturnValue(600000);

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('old-value');
            expect(mockExecFileSync.mock.calls).toHaveLength(1);
        });

        it('invalidates cached output when HEAD or index mtimes change', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            useTempHome();
            const {
                root,
                indexPath
            } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 60 };
            mockExecFileSync.mockReturnValueOnce('old-value\n');

            expect(runGit('status --porcelain -z', context)).toBe('old-value');

            clearGitCache();
            touch(indexPath, Date.now() + 10000);
            nowSpy.mockReturnValue(2000);
            mockExecFileSync.mockReturnValueOnce('new-value\n');

            expect(runGit('status --porcelain -z', context)).toBe('new-value');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
        });

        it('falls back to git when the persistent cache file is malformed', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            const { root } = createGitRepo();
            const context: RenderContext = { data: { cwd: root }, gitCacheTtlSeconds: 5 };
            mockExecFileSync.mockReturnValueOnce('old-value\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('old-value');
            fs.writeFileSync(getOnlyGitCachePath(home), '{ malformed json', 'utf-8');

            clearGitCache();
            mockExecFileSync.mockReturnValueOnce('new-value\n');

            expect(runGit('symbolic-ref --short HEAD', context)).toBe('new-value');
            expect(mockExecFileSync.mock.calls).toHaveLength(2);
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

        it('ignores unstaged rename source path in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce(' R new-name.txt\0ANT.txt\0');

            const result = getGitStatus({});
            expect(result.staged).toBe(false);
            expect(result.unstaged).toBe(true);
            expect(result.conflicts).toBe(false);
        });

        it('ignores unstaged copy source path in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce(' C copy.txt\0MOUSE.txt\0');

            const result = getGitStatus({});
            expect(result.staged).toBe(false);
            expect(result.unstaged).toBe(true);
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

    describe('getGitFileStatusCounts', () => {
        it('counts staged, unstaged, and untracked files from porcelain status', () => {
            mockExecFileSync.mockReturnValueOnce('M  staged-a.ts\0A  staged-b.ts\0 M unstaged-a.ts\0?? new-a.ts\0?? new-b.ts\0');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 2,
                unstaged: 1,
                untracked: 2
            });
        });

        it('counts files with both staged and unstaged changes in both totals', () => {
            mockExecFileSync.mockReturnValueOnce('MM file.ts');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 1,
                unstaged: 1,
                untracked: 0
            });
        });

        it('returns zero counts when there are no matching files', () => {
            mockExecFileSync.mockReturnValueOnce('');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 0,
                unstaged: 0,
                untracked: 0
            });
        });

        it('ignores rename source paths in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce('R  new-name.ts\0old-name.ts\0?? new-file.ts\0');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 1,
                unstaged: 0,
                untracked: 1
            });
        });

        it('ignores copy source paths in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce('C  copy.ts\0original.ts\0 M changed.ts');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 1,
                unstaged: 1,
                untracked: 0
            });
        });

        it('ignores unstaged rename source paths in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce(' R new-name.ts\0A-old-name.ts\0?? new-file.ts\0');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 0,
                unstaged: 1,
                untracked: 1
            });
        });

        it('ignores unstaged copy source paths in porcelain -z output', () => {
            mockExecFileSync.mockReturnValueOnce(' C copy.ts\0M-original.ts\0 M changed.ts');

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 0,
                unstaged: 2,
                untracked: 0
            });
        });

        it('returns zero counts when git commands fail', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('git failed'); });

            expect(getGitFileStatusCounts({})).toEqual({
                staged: 0,
                unstaged: 0,
                untracked: 0
            });
        });
    });
});
