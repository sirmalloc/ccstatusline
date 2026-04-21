import { execFileSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { clearGitCache } from '../git';
import {
    buildRepoWebUrl,
    getForkStatus,
    getRemoteInfo,
    getUpstreamRemoteInfo,
    listRemotes,
    parseRemoteUrl
} from '../git-remote';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockImplementationOnce: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

describe('git-remote utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    describe('parseRemoteUrl', () => {
        describe('SSH format (git@host:owner/repo)', () => {
            it('parses github.com SSH URL', () => {
                expect(parseRemoteUrl('git@github.com:owner/repo.git')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses GHES SSH URL', () => {
                expect(parseRemoteUrl('git@github.service.anz:org/project.git')).toEqual({
                    host: 'github.service.anz',
                    owner: 'org',
                    repo: 'project'
                });
            });

            it('parses SSH URL without .git suffix', () => {
                expect(parseRemoteUrl('git@github.com:owner/repo')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses SSH URL with trailing slash', () => {
                expect(parseRemoteUrl('git@github.com:owner/repo/')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses GitLab SSH URL', () => {
                expect(parseRemoteUrl('git@gitlab.com:group/project.git')).toEqual({
                    host: 'gitlab.com',
                    owner: 'group',
                    repo: 'project'
                });
            });

            it('parses nested GitLab SSH namespace', () => {
                expect(parseRemoteUrl('git@gitlab.com:group/subgroup/project.git')).toEqual({
                    host: 'gitlab.com',
                    owner: 'group/subgroup',
                    repo: 'project'
                });
            });
        });

        describe('HTTPS format', () => {
            it('parses github.com HTTPS URL', () => {
                expect(parseRemoteUrl('https://github.com/owner/repo.git')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses GHES HTTPS URL', () => {
                expect(parseRemoteUrl('https://github.service.anz/org/project.git')).toEqual({
                    host: 'github.service.anz',
                    owner: 'org',
                    repo: 'project'
                });
            });

            it('parses HTTPS URL without .git suffix', () => {
                expect(parseRemoteUrl('https://github.com/owner/repo')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses HTTP URL', () => {
                expect(parseRemoteUrl('http://github.com/owner/repo.git')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses nested HTTPS namespace', () => {
                expect(parseRemoteUrl('https://gitlab.com/group/subgroup/project.git')).toEqual({
                    host: 'gitlab.com',
                    owner: 'group/subgroup',
                    repo: 'project'
                });
            });
        });

        describe('ssh:// protocol format', () => {
            it('parses ssh:// URL', () => {
                expect(parseRemoteUrl('ssh://git@github.com/owner/repo.git')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });

            it('parses ssh:// URL for GHES', () => {
                expect(parseRemoteUrl('ssh://git@github.service.anz/org/project.git')).toEqual({
                    host: 'github.service.anz',
                    owner: 'org',
                    repo: 'project'
                });
            });
        });

        describe('git:// protocol format', () => {
            it('parses git:// URL', () => {
                expect(parseRemoteUrl('git://github.com/owner/repo.git')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });
        });

        describe('edge cases', () => {
            it('returns null for empty string', () => {
                expect(parseRemoteUrl('')).toBeNull();
            });

            it('returns null for whitespace-only string', () => {
                expect(parseRemoteUrl('   ')).toBeNull();
            });

            it('returns null for invalid URL', () => {
                expect(parseRemoteUrl('not-a-url')).toBeNull();
            });

            it('returns null for URL with only owner (no repo)', () => {
                expect(parseRemoteUrl('https://github.com/owner')).toBeNull();
            });

            it('returns null for unsupported protocol', () => {
                expect(parseRemoteUrl('ftp://github.com/owner/repo.git')).toBeNull();
            });

            it('trims whitespace from URL', () => {
                expect(parseRemoteUrl('  https://github.com/owner/repo.git  ')).toEqual({
                    host: 'github.com',
                    owner: 'owner',
                    repo: 'repo'
                });
            });
        });
    });

    describe('getRemoteInfo', () => {
        it('returns remote info for valid remote', () => {
            mockExecFileSync.mockReturnValue('https://github.com/hangie/ccstatusline.git\n');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            const result = getRemoteInfo('origin', context);

            expect(result).toEqual({
                name: 'origin',
                url: 'https://github.com/hangie/ccstatusline.git',
                host: 'github.com',
                owner: 'hangie',
                repo: 'ccstatusline'
            });
        });

        it('passes remote name as a literal git argument', () => {
            mockExecFileSync.mockReturnValue('https://github.com/hangie/ccstatusline.git\n');
            const remoteName = 'foo$(touch /tmp/pwn)';

            getRemoteInfo(remoteName, {});

            expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('git');
            expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['remote', 'get-url', '--', remoteName]);
        });

        it('returns null when remote does not exist', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('No such remote'); });

            expect(getRemoteInfo('nonexistent', {})).toBeNull();
        });

        it('returns null when URL cannot be parsed', () => {
            mockExecFileSync.mockReturnValue('invalid-url\n');

            expect(getRemoteInfo('origin', {})).toBeNull();
        });
    });

    describe('getUpstreamRemoteInfo', () => {
        it('prefers a literal upstream remote when present', () => {
            mockExecFileSync.mockReturnValueOnce('https://github.com/upstream-owner/repo.git\n');

            expect(getUpstreamRemoteInfo({})).toEqual({
                name: 'upstream',
                url: 'https://github.com/upstream-owner/repo.git',
                host: 'github.com',
                owner: 'upstream-owner',
                repo: 'repo'
            });
        });

        it('falls back to the tracking remote when upstream is not a remote name', () => {
            mockExecFileSync.mockImplementationOnce(() => { throw new Error('No such remote'); });
            mockExecFileSync.mockReturnValueOnce('hangie/feature/new-git-and-worktree-widgets\n');
            mockExecFileSync.mockReturnValueOnce('origin\nhangie\n');
            mockExecFileSync.mockReturnValueOnce('https://github.com/hangie/ccstatusline.git\n');

            expect(getUpstreamRemoteInfo({})).toEqual({
                name: 'hangie',
                url: 'https://github.com/hangie/ccstatusline.git',
                host: 'github.com',
                owner: 'hangie',
                repo: 'ccstatusline'
            });
        });

        it('matches the longest remote prefix when remote names contain slashes', () => {
            mockExecFileSync.mockImplementationOnce(() => { throw new Error('No such remote'); });
            mockExecFileSync.mockReturnValueOnce('team/upstream/feature/worktree\n');
            mockExecFileSync.mockReturnValueOnce('origin\nteam\nteam/upstream\n');
            mockExecFileSync.mockReturnValueOnce('https://github.com/team/upstream-repo.git\n');

            expect(getUpstreamRemoteInfo({})).toEqual({
                name: 'team/upstream',
                url: 'https://github.com/team/upstream-repo.git',
                host: 'github.com',
                owner: 'team',
                repo: 'upstream-repo'
            });
        });

        it('returns null when the tracking remote cannot be resolved', () => {
            mockExecFileSync.mockImplementationOnce(() => { throw new Error('No such remote'); });
            mockExecFileSync.mockReturnValueOnce('hangie/feature/new-git-and-worktree-widgets\n');
            mockExecFileSync.mockReturnValueOnce('origin\n');

            expect(getUpstreamRemoteInfo({})).toBeNull();
        });
    });

    describe('getForkStatus', () => {
        it('detects fork when origin and upstream differ', () => {
            mockExecFileSync.mockReturnValueOnce('https://github.com/hangie/ccstatusline.git\n');
            mockExecFileSync.mockReturnValueOnce('https://github.com/sirmalloc/ccstatusline.git\n');

            const result = getForkStatus({});

            expect(result.isFork).toBe(true);
            expect(result.origin?.owner).toBe('hangie');
            expect(result.upstream?.owner).toBe('sirmalloc');
        });

        it('detects fork when repos have different names', () => {
            mockExecFileSync.mockReturnValueOnce('https://github.com/hangie/my-fork.git\n');
            mockExecFileSync.mockReturnValueOnce('https://github.com/hangie/original.git\n');

            const result = getForkStatus({});

            expect(result.isFork).toBe(true);
        });

        it('returns not a fork when only origin exists', () => {
            mockExecFileSync.mockReturnValueOnce('https://github.com/owner/repo.git\n');
            mockExecFileSync.mockImplementation(() => { throw new Error('No such remote'); });

            const result = getForkStatus({});

            expect(result.isFork).toBe(false);
            expect(result.origin).not.toBeNull();
            expect(result.upstream).toBeNull();
        });

        it('returns not a fork when origin equals upstream', () => {
            mockExecFileSync.mockReturnValueOnce('https://github.com/owner/repo.git\n');
            mockExecFileSync.mockReturnValueOnce('https://github.com/owner/repo.git\n');

            const result = getForkStatus({});

            expect(result.isFork).toBe(false);
        });

        it('returns not a fork when no remotes exist', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('No such remote'); });

            const result = getForkStatus({});

            expect(result.isFork).toBe(false);
            expect(result.origin).toBeNull();
            expect(result.upstream).toBeNull();
        });
    });

    describe('listRemotes', () => {
        it('returns list of remote names', () => {
            mockExecFileSync.mockReturnValue('origin\nupstream\n');

            expect(listRemotes({})).toEqual(['origin', 'upstream']);
        });

        it('returns empty array when no remotes', () => {
            mockExecFileSync.mockImplementation(() => { throw new Error('Not a git repo'); });

            expect(listRemotes({})).toEqual([]);
        });

        it('filters empty lines', () => {
            mockExecFileSync.mockReturnValue('origin\n\nupstream\n\n');

            expect(listRemotes({})).toEqual(['origin', 'upstream']);
        });
    });

    describe('buildRepoWebUrl', () => {
        it('builds URL for github.com', () => {
            const remote = {
                name: 'origin',
                url: 'git@github.com:owner/repo.git',
                host: 'github.com',
                owner: 'owner',
                repo: 'repo'
            };

            expect(buildRepoWebUrl(remote)).toBe('https://github.com/owner/repo');
        });

        it('builds URL for GHES', () => {
            const remote = {
                name: 'origin',
                url: 'git@github.service.anz:org/project.git',
                host: 'github.service.anz',
                owner: 'org',
                repo: 'project'
            };

            expect(buildRepoWebUrl(remote)).toBe('https://github.service.anz/org/project');
        });

        it('builds URL for nested namespaces', () => {
            const remote = {
                name: 'origin',
                url: 'git@gitlab.com:group/subgroup/project.git',
                host: 'gitlab.com',
                owner: 'group/subgroup',
                repo: 'project'
            };

            expect(buildRepoWebUrl(remote)).toBe('https://gitlab.com/group/subgroup/project');
        });
    });
});
