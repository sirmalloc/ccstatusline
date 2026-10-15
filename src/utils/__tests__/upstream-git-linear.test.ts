import { ok } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { clearGitCache } from '../git';
import {
    buildBranchWebUrl,
    buildRepoWebUrl,
    getForkStatus,
    getRemoteInfo,
    getUpstreamRemoteInfo,
    listRemotes,
    parseRemoteUrl
} from '../git-remote';

import {
    COMMIT_ENV,
    gitSync,
    probeRealRunGitAvailable
} from './git-test-helpers';

// Upstream ae9721e: both parsers used to backtrack quadratically on input a
// repository controls. Remote URLs come from the repository's own config, so a
// long run of slashes in a URL is quadratic before the fix.
//
// The .git file half of the fix is covered by upstream's own mock-based test:
// modern engines no longer backtrack on the old `gitdir:\s*(.+)$` pattern, and
// a real git refuses to consume the whitespace-run input, so that half is not
// reproducible mock-free on this machine.

const ORIGIN_URL = 'https://github.com/axisrow/ccstatusline.git';
const UPSTREAM_URL = 'git@github.com:sirmalloc/ccstatusline.git';

describe('upstream ae9721e: git parsers run in linear time', () => {
    it('parses a remote URL with a long run of slashes in linear time', () => {
        const started = Date.now();

        expect(parseRemoteUrl(`https://github.com/owner${'/'.repeat(100_000)}repo.git`)).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo'
        });

        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe('parseRemoteUrl', () => {
    it('trims surrounding whitespace from a remote url', () => {
        expect(parseRemoteUrl('  git@github.com:owner/repo.git  ')).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo'
        });
    });

    it('collapses repeated slashes in an ssh path', () => {
        expect(parseRemoteUrl('git@github.com:owner//repo.git')).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo'
        });
    });

    it('keeps repo names that only start with .git', () => {
        expect(parseRemoteUrl('https://github.com/owner/repo.github.io')).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo.github.io'
        });
    });

    it('joins nested owners with slashes in the url form', () => {
        expect(parseRemoteUrl('https://github.com/group/sub/repo')).toEqual({
            host: 'github.com',
            owner: 'group/sub',
            repo: 'repo'
        });
    });

    it.each([
        ['git@github.com:owner/repo.git', 'github.com'],
        ['git@github.com:owner/repo', 'github.com'],
        ['git@github.com:owner/repo/', 'github.com'],
        ['user@host.example:owner/repo.git', 'host.example'],
        ['github.com:owner/repo.git', 'github.com'],
        ['git@host:group/sub/repo.git', 'host']
    ])('parses the ssh form %s', (url, host) => {
        const owner = url.includes('group/sub') ? 'group/sub' : 'owner';

        expect(parseRemoteUrl(url)).toEqual({ host, owner, repo: 'repo' });
    });

    it.each([
        ['https://github.com/owner/repo.git', 'https'],
        ['http://github.com/owner/repo', 'http'],
        ['ssh://git@github.com/owner/repo.git', 'ssh'],
        ['git://github.com/owner/repo', 'git']
    ])('parses the url form %s', (url, protocol) => {
        expect(parseRemoteUrl(url)).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo'
        });
    });

    it('keeps the port in the host of an http(s) remote only', () => {
        expect(parseRemoteUrl('https://github.com:8443/owner/repo')).toEqual({
            host: 'github.com:8443',
            owner: 'owner',
            repo: 'repo'
        });
        expect(parseRemoteUrl('http://github.com:8443/owner/repo')).toEqual({
            host: 'github.com:8443',
            owner: 'owner',
            repo: 'repo'
        });
        expect(parseRemoteUrl('ssh://git@github.com:2222/owner/repo')).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo'
        });
    });

    it('drops empty path segments and a .git suffix', () => {
        expect(parseRemoteUrl('https://github.com//owner//repo//')).toEqual({
            host: 'github.com',
            owner: 'owner',
            repo: 'repo'
        });
    });

    it.each([
        [''],
        ['   '],
        ['git@github.com:repo.git'],
        ['https://github.com/repo'],
        ['ftp://github.com/owner/repo'],
        ['file:///tmp/owner/repo'],
        ['not a url at all'],
        [':a/b:c/d'],
        ['https://[']
    ])('rejects %s', (url) => {
        expect(parseRemoteUrl(url)).toBeNull();
    });
});

// Sibling suites mock node:child_process and, when this file shares the bun
// runner's single process with them, that mock can reach git.ts's own
// spawnSync (the copy of the module loaded after their vi.mock call), making
// every runGit resolve to null. Probe runGit end to end once and skip the
// real-git suite when it is broken; vitest isolates test files and always
// runs it, as does an isolated `bun test <file>`.
const realRunGitAvailable = probeRealRunGitAvailable();

describe.skipIf(!realRunGitAvailable)('remote lookups against a real repository', () => {
    let savedEnv: Record<string, string | undefined> = {};
    let repo = '';

    beforeEach(() => {
        savedEnv = {
            HOME: process.env.HOME,
            GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
            GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM
        };
        process.env.HOME = mkdtempSync(join(tmpdir(), 'ccsl-git-remote-home-'));
        process.env.GIT_CONFIG_GLOBAL = '/dev/null';
        process.env.GIT_CONFIG_SYSTEM = '/dev/null';

        repo = mkdtempSync(join(tmpdir(), 'ccsl-git-remote-'));
        gitSync(['init', '-b', 'main', repo]);
        gitSync(['-C', repo, 'commit', '--allow-empty', '-m', 'init'], COMMIT_ENV);
        gitSync(['-C', repo, 'remote', 'add', 'origin', ORIGIN_URL]);
        clearGitCache();
    });

    afterEach(() => {
        process.env.HOME = savedEnv.HOME;
        process.env.GIT_CONFIG_GLOBAL = savedEnv.GIT_CONFIG_GLOBAL;
        process.env.GIT_CONFIG_SYSTEM = savedEnv.GIT_CONFIG_SYSTEM;
        clearGitCache();
    });

    function git(...args: string[]): void {
        gitSync(['-C', repo, ...args]);
        clearGitCache();
    }

    function context(): { data: { cwd: string } } {
        return { data: { cwd: repo } };
    }

    it('lists remotes and parses a remote by name', () => {
        expect(listRemotes(context())).toEqual(['origin']);
        expect(getRemoteInfo('origin', context())).toEqual({
            name: 'origin',
            url: ORIGIN_URL,
            host: 'github.com',
            owner: 'axisrow',
            repo: 'ccstatusline'
        });
        expect(getRemoteInfo('missing', context())).toBeNull();
    });

    it('is not a fork without a peer remote', () => {
        const status = getForkStatus(context());

        expect(status.isFork).toBe(false);
        expect(status.origin).not.toBeNull();
        expect(status.upstream).toBeNull();
    });

    it('is a fork when a peer remote differs in owner', () => {
        git('remote', 'add', 'upstream', UPSTREAM_URL);

        expect(getForkStatus(context()).isFork).toBe(true);
    });

    it('is not a fork when the peer remote mirrors origin', () => {
        git('remote', 'add', 'upstream', 'git@github.com:axisrow/ccstatusline.git');

        expect(getForkStatus(context()).isFork).toBe(false);
    });

    it('prefers a literal upstream remote', () => {
        git('remote', 'add', 'upstream', UPSTREAM_URL);

        expect(getUpstreamRemoteInfo(context())?.owner).toBe('sirmalloc');
    });

    it('falls back to the tracking remote', () => {
        // a remote whose name sorts before origin once the list is ordered by
        // decreasing name length, so the tracking lookup cannot pass by accident
        git('remote', 'add', 'aaa-aaa-aaa-aaa-aaa', 'https://github.com/aaa-owner/aaa.git');
        git('update-ref', 'refs/remotes/origin/main', 'HEAD');
        git('branch', '--set-upstream-to=origin/main', 'main');

        expect(getUpstreamRemoteInfo(context())?.owner).toBe('axisrow');
    });

    it('returns null when there is no upstream and no tracking remote', () => {
        expect(getUpstreamRemoteInfo(context())).toBeNull();
    });

    it('does not fall through a missing tracking remote to a remote named null', () => {
        git('remote', 'add', 'null', 'https://github.com/null/repo.git');

        expect(getUpstreamRemoteInfo(context())).toBeNull();
    });

    it('does not trust a tracking ref for an unknown remote', () => {
        git('update-ref', 'refs/remotes/weird/main', 'HEAD');
        git('config', 'branch.main.remote', 'weird');
        git('config', 'branch.main.merge', 'refs/heads/main');

        expect(getUpstreamRemoteInfo(context())).toBeNull();
    });

    it('rejects a remote whose url does not parse', () => {
        git('remote', 'add', 'bad', 'not a url at all');

        expect(getRemoteInfo('bad', context())).toBeNull();
    });

    it('finds a fork peer in a remote named fork', () => {
        git('remote', 'add', 'fork', UPSTREAM_URL);

        expect(getForkStatus(context()).isFork).toBe(true);
    });

    it('is a fork when only the repo differs', () => {
        git('remote', 'add', 'fork', 'git@github.com:axisrow/other.git');

        expect(getForkStatus(context()).isFork).toBe(true);
    });

    it('returns an empty remote list outside a repository', () => {
        expect(listRemotes({ data: { cwd: mkdtempSync(join(tmpdir(), 'ccsl-nogit-')) } })).toEqual([]);
    });

    it('builds web urls from remote info', () => {
        const remote = getRemoteInfo('origin', context());

        expect(remote).not.toBeNull();
        ok(remote);
        expect(buildRepoWebUrl(remote)).toBe('https://github.com/axisrow/ccstatusline');
        expect(buildBranchWebUrl(remote, 'feature%2Fx')).toBe(
            'https://github.com/axisrow/ccstatusline/tree/feature%2Fx'
        );
    });
});
