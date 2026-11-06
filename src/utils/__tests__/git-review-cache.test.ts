import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import * as executablePath from '../executable-path';
import { GIT_HARDENING_ARGS } from '../git-hardening';
import {
    fetchGitReviewData,
    getCachedGitReviewData,
    refreshGitReviewCacheFromCli,
    type GitReviewCacheDeps
} from '../git-review-cache';

import { mockExecutableResolution } from './executable-path-test-helpers';
import { gitCommandOf } from './git-test-helpers';

interface FakeCacheFile {
    content: string;
    mtimeMs: number;
}

interface PrCacheHarness {
    authDurations: number[];
    cacheFiles: Map<string, FakeCacheFile>;
    deps: GitReviewCacheDeps;
    execCalls: { args: string[]; cmd: string; cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }[];
    ghDurations: number[];
    ghResponses: (Error | string)[];
    glabResponses: (Error | string)[];
    spawnCalls: { args: string[]; command: string }[];
    advanceNow: (milliseconds: number) => void;
    setCurrentRef: (ref: string) => void;
    addTag: (name: string) => void;
    setOriginRemoteUrl: (url: string) => void;
    setGlabAvailable: (available: boolean) => void;
    setCliAuthedForHost: (cli: 'gh' | 'glab', host: string, authed: boolean) => void;
    setSshHostAlias: (host: string, hostname: string) => void;
}

function createHarness(): PrCacheHarness {
    const authDurations: number[] = [];
    const cacheFiles = new Map<string, FakeCacheFile>();
    const execCalls: { args: string[]; cmd: string; cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }[] = [];
    const ghDurations: number[] = [];
    const ghResponses: (Error | string)[] = [];
    const glabResponses: (Error | string)[] = [];
    const spawnCalls: { args: string[]; command: string }[] = [];
    let now = 1_700_000_000_000;
    let currentRef = 'feature/cache-a';
    const tags = new Set<string>();
    let originRemoteUrl: string | null = null;
    let glabAvailable = false;
    const authedHosts: Record<'gh' | 'glab', Set<string>> = {
        gh: new Set(),
        glab: new Set()
    };
    const sshHostAliases = new Map<string, string>();

    const deps: GitReviewCacheDeps = {
        closeSync: () => undefined,
        execFileSync: ((cmd, args, options) => {
            const commandArgs = Array.isArray(args)
                ? args.map(arg => String(arg))
                : [];
            execCalls.push({
                args: commandArgs,
                cmd,
                cwd: typeof options === 'object' && 'cwd' in options
                    ? String(options.cwd)
                    : undefined,
                env: typeof options === 'object' && 'env' in options
                    ? options.env
                    : undefined,
                timeout: typeof options === 'object' && 'timeout' in options
                    ? options.timeout
                    : undefined
            });
            const gitArgs = cmd === 'git' ? gitCommandOf(commandArgs).split(' ') : [];

            if (cmd === 'git' && gitArgs[0] === 'remote') {
                if (originRemoteUrl === null) {
                    throw new Error('no origin configured');
                }
                return `${originRemoteUrl}\n`;
            }
            if (cmd === 'git' && gitArgs[0] === 'symbolic-ref') {
                // As git does: the full ref, or with --short the branch name,
                // which becomes `heads/<name>` when a tag has the same name
                if (!gitArgs.includes('--short'))
                    return `refs/heads/${currentRef}\n`;
                return `${tags.has(currentRef) ? 'heads/' : ''}${currentRef}\n`;
            }
            if (cmd === 'git' && gitArgs[0] === 'rev-parse')
                return 'abc123\n';
            if (cmd === 'ssh' && commandArgs[0] === '-G') {
                const host = commandArgs.at(-1);
                if (!host)
                    throw new Error('missing ssh host');
                return `hostname ${sshHostAliases.get(host) ?? host}\n`;
            }
            if (cmd === 'gh' && commandArgs[0] === '--version')
                return 'gh version 2.0.0\n';
            if (cmd === 'gh' && commandArgs[0] === 'auth' && commandArgs[1] === 'status') {
                now += authDurations.shift() ?? 0;
                const hostIdx = commandArgs.indexOf('--hostname');
                const host = hostIdx >= 0 ? commandArgs[hostIdx + 1] : undefined;
                if (!host || !authedHosts.gh.has(host))
                    throw new Error(`gh not authed for ${host ?? '<unspecified>'}`);
                return '';
            }
            if (cmd === 'gh' && commandArgs[0] === 'pr') {
                now += ghDurations.shift() ?? 0;
                const response = ghResponses.shift();
                if (response instanceof Error)
                    throw response;
                return response ?? '';
            }
            if (cmd === 'glab' && commandArgs[0] === '--version') {
                if (!glabAvailable)
                    throw new Error('glab not installed');
                return 'glab 1.44.0\n';
            }
            if (cmd === 'glab' && commandArgs[0] === 'auth' && commandArgs[1] === 'status') {
                if (!glabAvailable)
                    throw new Error('glab not installed');
                now += authDurations.shift() ?? 0;
                const hostIdx = commandArgs.indexOf('--hostname');
                const host = hostIdx >= 0 ? commandArgs[hostIdx + 1] : undefined;
                if (!host || !authedHosts.glab.has(host))
                    throw new Error(`glab not authed for ${host ?? '<unspecified>'}`);
                return '';
            }
            if (cmd === 'glab' && commandArgs[0] === 'mr') {
                const response = glabResponses.shift();
                if (response instanceof Error)
                    throw response;
                return response ?? '';
            }

            throw new Error(`Unexpected command: ${cmd} ${commandArgs.join(' ')}`);
        }) as GitReviewCacheDeps['execFileSync'],
        existsSync: filePath => cacheFiles.has(String(filePath)),
        getExecPath: () => '/usr/bin/node',
        getHomedir: () => '/tmp/home',
        mkdirSync: () => undefined,
        openSync: (filePath) => {
            const normalizedPath = String(filePath);
            if (cacheFiles.has(normalizedPath)) {
                throw new Error('EEXIST');
            }
            cacheFiles.set(normalizedPath, { content: '', mtimeMs: now });
            return 42;
        },
        now: () => now,
        readFileSync: (filePath => cacheFiles.get(String(filePath))?.content ?? '') as GitReviewCacheDeps['readFileSync'],
        getScriptPath: () => '/app/ccstatusline.js',
        spawn: ((command, args) => {
            spawnCalls.push({
                args: Array.isArray(args) ? args.map(arg => String(arg)) : [],
                command
            });
            return { unref: () => undefined };
        }) as GitReviewCacheDeps['spawn'],
        statSync: (filePath => ({ mtimeMs: cacheFiles.get(String(filePath))?.mtimeMs ?? now })) as GitReviewCacheDeps['statSync'],
        unlinkSync: (filePath) => {
            if (!cacheFiles.delete(String(filePath))) {
                throw new Error('ENOENT');
            }
        },
        writeFileSync: (filePath, content) => {
            const normalizedContent = typeof content === 'string'
                ? content
                : Buffer.isBuffer(content)
                    ? content.toString('utf8')
                    : '';
            cacheFiles.set(String(filePath), {
                content: normalizedContent,
                mtimeMs: now
            });
        }
    };

    return {
        authDurations,
        cacheFiles,
        deps,
        execCalls,
        ghDurations,
        ghResponses,
        glabResponses,
        spawnCalls,
        advanceNow: (milliseconds) => {
            now += milliseconds;
        },
        setCurrentRef: (ref: string) => {
            currentRef = ref;
        },
        addTag: (name: string) => {
            tags.add(name);
        },
        setOriginRemoteUrl: (url: string) => {
            originRemoteUrl = url;
        },
        setGlabAvailable: (available: boolean) => {
            glabAvailable = available;
        },
        setCliAuthedForHost: (cli: 'gh' | 'glab', host: string, authed: boolean) => {
            if (authed) {
                authedHosts[cli].add(host);
            } else {
                authedHosts[cli].delete(host);
            }
        },
        setSshHostAlias: (host: string, hostname: string) => {
            sshHostAliases.set(host, hostname);
        }
    };
}

function prepareCachePath(harness: PrCacheHarness): string {
    getCachedGitReviewData('/tmp/repo', {}, harness.deps);
    const lockPath = [...harness.cacheFiles.keys()].find(filePath => filePath.endsWith('.lock'));
    if (!lockPath) {
        throw new Error('Expected a refresh lock');
    }
    harness.cacheFiles.delete(lockPath);
    harness.spawnCalls.length = 0;
    return lockPath.slice(0, -'.lock'.length);
}

// The git config that the environment gives git run by another program
function gitConfigFromEnv(env: NodeJS.ProcessEnv | undefined): [string, string][] {
    const count = Number.parseInt(env?.GIT_CONFIG_COUNT ?? '0', 10);
    return Array.from({ length: count }, (_, index): [string, string] => [
        env?.[`GIT_CONFIG_KEY_${index}`] ?? '',
        env?.[`GIT_CONFIG_VALUE_${index}`] ?? ''
    ]);
}

// The fields a gh call asks for: the value after --json
function jsonFields(args: string[] | undefined): string | undefined {
    const index = args?.indexOf('--json') ?? -1;
    return index >= 0 ? args?.[index + 1] : undefined;
}

// A gh call's arguments without its --json fields: what it looks up
function withoutJsonFields(args: string[] | undefined): string[] {
    const index = args?.indexOf('--json') ?? -1;
    return index >= 0 ? [...(args ?? []).slice(0, index), ...(args ?? []).slice(index + 2)] : [...(args ?? [])];
}

// The `gh pr checks` calls a lookup made
function prChecksCalls(harness: PrCacheHarness): PrCacheHarness['execCalls'] {
    return harness.execCalls.filter(call => call.cmd === 'gh' && call.args[0] === 'pr' && call.args[1] === 'checks');
}

// The `auth status` calls a lookup made, each as its command line
function authProbes(harness: PrCacheHarness): string[] {
    return harness.execCalls
        .filter(call => call.args[0] === 'auth')
        .map(call => [call.cmd, ...call.args].join(' '));
}

// What `gh pr view` prints for PR #42 with this statusCheckRollup
function prWithChecks(statusCheckRollup: unknown[]): string {
    return JSON.stringify({
        number: 42,
        reviewDecision: '',
        state: 'OPEN',
        statusCheckRollup,
        title: 'Re-run checks',
        url: 'https://github.com/example-owner/example-repo/pull/42'
    });
}

// The rollup lists every run on the PR's head commit: CI's `test` failed, then
// passed on a re-run, and `lint` passed
const RERUN_ROLLUP = [
    { __typename: 'CheckRun', conclusion: 'FAILURE', name: 'test', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'CI' },
    { __typename: 'CheckRun', conclusion: 'SUCCESS', name: 'test', startedAt: '2026-10-14T10:20:00Z', status: 'COMPLETED', workflowName: 'CI' },
    { __typename: 'CheckRun', conclusion: 'SUCCESS', name: 'lint', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'CI' }
];
// `gh pr checks` keeps the newest run of each check
const RERUN_CHECK_ROWS = JSON.stringify([{ state: 'SUCCESS' }, { state: 'SUCCESS' }]);
const RERUN_ROLLUP_COUNTS = { failing: 1, pending: 0, state: 'failing', success: 2 };

mockExecutableResolution();

describe('git-review-cache', () => {
    it('looks up git, gh and ssh on PATH before running them', () => {
        const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(name => name);
        try {
            const harness = createHarness();
            harness.setOriginRemoteUrl('git@mygit:example-owner/example-repo.git');
            harness.setSshHostAlias('mygit', 'github.com');
            harness.setCliAuthedForHost('gh', 'github.com', true);
            harness.ghResponses.push(new Error('no pull request found'));
            harness.ghResponses.push(new Error('no pull request found'));

            fetchGitReviewData('/tmp/repo', harness.deps);

            const looked = new Set(resolve.mock.calls.map(call => call[0]));
            expect([...looked].sort()).toEqual(['gh', 'git', 'ssh']);
        } finally {
            resolve.mockRestore();
        }
    });

    it('looks up glab on PATH before running it', () => {
        const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(name => name);
        try {
            const harness = createHarness();
            harness.setOriginRemoteUrl('git@gitlab.com:owner/repo.git');
            harness.setGlabAvailable(true);
            harness.glabResponses.push(new Error('no merge request found'));
            harness.glabResponses.push(new Error('no merge request found'));

            fetchGitReviewData('/tmp/repo', harness.deps);

            expect(resolve.mock.calls.map(call => call[0])).toContain('glab');
        } finally {
            resolve.mockRestore();
        }
    });

    it('treats gh as unavailable when it isn\'t on PATH', () => {
        const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation((name) => {
            if (name === 'gh') {
                throw new Error('gh was not found on PATH');
            }
            return name;
        });
        try {
            const harness = createHarness();
            harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');

            expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();
            expect(harness.execCalls.filter(call => call.cmd === 'gh')).toHaveLength(0);
        } finally {
            resolve.mockRestore();
        }
    });

    it('runs git with the hardening config, and gives it to the git that gh runs', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(new Error('no pull request found'));
        harness.ghResponses.push(new Error('no pull request found'));

        fetchGitReviewData('/tmp/repo', harness.deps);

        const gitCalls = harness.execCalls.filter(call => call.cmd === 'git');
        expect(gitCalls.length).toBeGreaterThan(0);
        expect(gitCalls.every(call => call.args.slice(0, GIT_HARDENING_ARGS.length).join(' ') === GIT_HARDENING_ARGS.join(' '))).toBe(true);

        const ghPrCalls = harness.execCalls.filter(call => call.cmd === 'gh' && call.args[0] === 'pr');
        expect(ghPrCalls).toHaveLength(2);
        for (const call of ghPrCalls) {
            expect(gitConfigFromEnv(call.env)).toEqual(expect.arrayContaining([
                ['core.fsmonitor', ''],
                ['safe.bareRepository', 'explicit']
            ]));
        }
    });

    it('gives the hardening config to the git that glab runs', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.com:owner/repo.git');
        harness.setGlabAvailable(true);
        harness.glabResponses.push(new Error('no merge request found'));
        harness.glabResponses.push(new Error('no merge request found'));

        fetchGitReviewData('/tmp/repo', harness.deps);

        const glabMrCalls = harness.execCalls.filter(call => call.cmd === 'glab' && call.args[0] === 'mr');
        expect(glabMrCalls.length).toBeGreaterThan(0);
        for (const call of glabMrCalls) {
            expect(gitConfigFromEnv(call.env)).toEqual(expect.arrayContaining([
                ['core.fsmonitor', ''],
                ['safe.bareRepository', 'explicit']
            ]));
        }
    });

    it('negative-caches failed gh PR lookups', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(new Error('no pull request found'));
        harness.ghResponses.push(new Error('no pull request found'));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        const ghCallsAfterFirstRender = harness.execCalls.filter(call => call.cmd === 'gh');
        expect(ghCallsAfterFirstRender).toHaveLength(3);
        const ghPrCalls = ghCallsAfterFirstRender.filter(call => call.args[0] === 'pr');
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[0]?.args).not.toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls.every(call => jsonFields(call.args) === 'url,number,title,state,reviewDecision')).toBe(true);

        const cachedMissEntry = [...harness.cacheFiles.values()].at(0);
        expect(JSON.parse(cachedMissEntry?.content ?? '')).toEqual({
            checksQueried: true,
            data: null,
            version: 1
        });

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        const ghCallsAfterSecondRender = harness.execCalls.filter(call => call.cmd === 'gh');
        expect(ghCallsAfterSecondRender).toHaveLength(3);
    });

    it('does not retry metadata-only for ordinary CI lookup failures', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(new Error('no pull request found'));
        harness.ghResponses.push(new Error('no pull request found'));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })).toBeNull();

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[0]?.args).not.toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls.every(call => jsonFields(call.args)?.includes('statusCheckRollup'))).toBe(true);
    });

    it('shares one deadline across unpinned and pinned CI lookups', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghDurations.push(5_000);
        harness.ghResponses.push(new Error('timed out'));
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Too late',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })).toBeNull();

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(1);
    });

    it('returns immediately on a cache miss and schedules one metadata refresh', () => {
        const harness = createHarness();

        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)).toBeNull();
        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)).toBeNull();

        expect(harness.execCalls.filter(call => call.cmd === 'gh')).toHaveLength(0);
        expect(harness.spawnCalls).toHaveLength(1);
        expect(harness.spawnCalls[0]?.command).toBe('/usr/bin/node');
        expect(harness.spawnCalls[0]?.args.slice(0, 4)).toEqual([
            '/app/ccstatusline.js',
            '--internal-refresh-git-review-cache',
            '/tmp/repo',
            'metadata'
        ]);
    });

    it('refreshes through the detached CLI mode and releases its lock', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Background result',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));

        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)).toBeNull();
        const lockPath = [...harness.cacheFiles.keys()].find(filePath => filePath.endsWith('.lock'));
        expect(lockPath).toBeDefined();
        refreshGitReviewCacheFromCli('/tmp/repo', {}, lockPath ?? '', harness.deps);

        expect([...harness.cacheFiles.keys()].some(filePath => filePath.endsWith('.lock'))).toBe(false);
        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)?.title).toBe('Background result');
        expect(harness.spawnCalls).toHaveLength(1);
    });

    it('returns stale data while scheduling a refresh', () => {
        const harness = createHarness();
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Stale but useful',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));
        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.title).toBe('Stale but useful');
        harness.advanceNow(30_001);

        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)?.title).toBe('Stale but useful');
        expect(harness.spawnCalls).toHaveLength(1);
    });

    it('recovers a stale refresh lock', () => {
        const harness = createHarness();
        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)).toBeNull();
        expect(harness.spawnCalls).toHaveLength(1);

        harness.advanceNow(30_001);
        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)).toBeNull();
        expect(harness.spawnCalls).toHaveLength(2);
    });

    it('reads legacy metadata cache files and upgrades them when CI is requested', () => {
        const harness = createHarness();
        const cachePath = prepareCachePath(harness);
        const legacyData = {
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Legacy cache',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        };
        harness.cacheFiles.set(cachePath, {
            content: JSON.stringify(legacyData),
            mtimeMs: harness.deps.now()
        });

        expect(getCachedGitReviewData('/tmp/repo', {}, harness.deps)).toEqual(legacyData);
        expect(harness.spawnCalls).toHaveLength(0);
        expect(getCachedGitReviewData('/tmp/repo', { includeChecks: true }, harness.deps)).toEqual(legacyData);
        expect(harness.spawnCalls).toHaveLength(1);
        expect(harness.spawnCalls[0]?.args[3]).toBe('checks');
    });

    it('accepts legacy empty negative-cache files without refreshing them while fresh', () => {
        const harness = createHarness();
        const cachePath = prepareCachePath(harness);
        harness.cacheFiles.set(cachePath, { content: '', mtimeMs: harness.deps.now() });

        expect(getCachedGitReviewData('/tmp/repo', { includeChecks: true }, harness.deps)).toBeNull();
        expect(harness.spawnCalls).toHaveLength(0);
    });

    it('records an empty CI rollup as queried so it is not fetched repeatedly', () => {
        const harness = createHarness();
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            statusCheckRollup: [],
            title: 'No checks configured',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toBeUndefined();
        expect(getCachedGitReviewData('/tmp/repo', { includeChecks: true }, harness.deps)?.title).toBe('No checks configured');
        expect(harness.spawnCalls).toHaveLength(0);
    });

    it('uses a different cache entry for each checked-out branch', () => {
        const harness = createHarness();
        harness.ghResponses.push(JSON.stringify({
            number: 123,
            reviewDecision: '',
            state: 'OPEN',
            title: 'First PR',
            url: 'https://github.com/owner/repo/pull/123'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 123,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'First PR',
            url: 'https://github.com/owner/repo/pull/123'
        });

        harness.setCurrentRef('feature/cache-b');
        harness.ghResponses.push(JSON.stringify({
            number: 456,
            reviewDecision: 'APPROVED',
            state: 'OPEN',
            title: 'Second PR',
            url: 'https://github.com/owner/repo/pull/456'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 456,
            provider: 'gh',
            reviewDecision: 'APPROVED',
            state: 'OPEN',
            title: 'Second PR',
            url: 'https://github.com/owner/repo/pull/456'
        });

        const writtenCachePaths = [...harness.cacheFiles.keys()];
        expect(writtenCachePaths.length).toBe(2);
        expect(writtenCachePaths[0]).not.toBe(writtenCachePaths[1]);
        const normalize = (filePath: string): string => filePath.replace(/\\/g, '/');
        expect(normalize(writtenCachePaths[0] ?? '')).toContain('/.cache/ccstatusline/git-review/git-review-');
        expect(normalize(writtenCachePaths[1] ?? '')).toContain('/.cache/ccstatusline/git-review/git-review-');

        harness.setCurrentRef('feature/cache-a');
        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 123,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'First PR',
            url: 'https://github.com/owner/repo/pull/123'
        });
        expect(harness.cacheFiles.size).toBe(2);

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
    });

    it('fetches merge request data from glab for GitLab remotes', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.com:owner/repo.git');
        harness.setGlabAvailable(true);
        harness.glabResponses.push(JSON.stringify({
            iid: 77,
            state: 'opened',
            title: 'GitLab MR',
            web_url: 'https://gitlab.com/owner/repo/-/merge_requests/77'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 77,
            provider: 'glab',
            reviewDecision: '',
            state: 'OPEN',
            title: 'GitLab MR',
            url: 'https://gitlab.com/owner/repo/-/merge_requests/77'
        });

        const ghCalls = harness.execCalls.filter(call => call.cmd === 'gh');
        expect(ghCalls).toHaveLength(0);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(1);
    });

    it('maps glab merged state to MERGED', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://gitlab.example.com/owner/repo.git');
        harness.setGlabAvailable(true);
        harness.glabResponses.push(JSON.stringify({
            iid: 12,
            state: 'merged',
            title: 'Done',
            web_url: 'https://gitlab.example.com/owner/repo/-/merge_requests/12'
        }));

        const data = fetchGitReviewData('/tmp/repo', harness.deps);
        expect(data?.state).toBe('MERGED');
    });

    it('uses gh\'s default repo resolution and includes CI checks in one query', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            statusCheckRollup: [
                { conclusion: 'SUCCESS', status: 'COMPLETED' },
                { conclusion: '', status: 'IN_PROGRESS' }
            ],
            title: 'Standard PR',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })).toEqual({
            checks: {
                failing: 0,
                pending: 1,
                state: 'pending',
                success: 1
            },
            number: 42,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Standard PR',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        });

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(1);
        expect(ghPrCalls[0]?.args).not.toContain('--repo');
        expect(jsonFields(ghPrCalls[0]?.args)).toBe(
            'url,number,title,state,reviewDecision,statusCheckRollup'
        );
    });

    it('retries metadata-only when gh cannot query CI checks', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(new Error('statusCheckRollup is unavailable'));
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: 'APPROVED',
            state: 'OPEN',
            title: 'Restricted token PR',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));

        const expected = {
            number: 42,
            provider: 'gh' as const,
            reviewDecision: 'APPROVED',
            state: 'OPEN',
            title: 'Restricted token PR',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        };
        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })).toEqual(expected);

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[0]?.args.slice(0, -2)).toEqual(ghPrCalls[1]?.args.slice(0, -2));
        expect(jsonFields(ghPrCalls[0]?.args)).toBe(
            'url,number,title,state,reviewDecision,statusCheckRollup'
        );
        expect(jsonFields(ghPrCalls[1]?.args)).toBe('url,number,title,state,reviewDecision');

        const cachedEntry = [...harness.cacheFiles.values()].at(0);
        expect(JSON.parse(cachedEntry?.content ?? '')).toEqual({
            checksQueried: true,
            data: expected,
            version: 1
        });

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })).toEqual(expected);
        const cachedGhPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(cachedGhPrCalls).toHaveLength(2);
    });

    it('counts only the newest run of a re-run check, from gh pr checks', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks(RERUN_ROLLUP));
        harness.ghResponses.push(RERUN_CHECK_ROWS);

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual({
            failing: 0,
            pending: 0,
            state: 'passing',
            success: 2
        });

        const checksCalls = prChecksCalls(harness);
        expect(checksCalls.map(call => call.args)).toEqual([['pr', 'checks', '--json', 'state', '--', '42']]);
        expect(checksCalls[0]?.cwd).toBe('/tmp/repo');
        expect(gitConfigFromEnv(checksCalls[0]?.env)).toEqual(expect.arrayContaining([
            ['core.fsmonitor', ''],
            ['safe.bareRepository', 'explicit']
        ]));
    });

    it('counts only the newest run of a re-run status context, from gh pr checks', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks([
            { __typename: 'StatusContext', context: 'ci/jenkins', startedAt: '2026-10-14T10:00:00Z', state: 'FAILURE' },
            { __typename: 'StatusContext', context: 'ci/jenkins', startedAt: '2026-10-14T10:20:00Z', state: 'SUCCESS' }
        ]));
        harness.ghResponses.push(JSON.stringify([{ state: 'SUCCESS' }]));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual({
            failing: 0,
            pending: 0,
            state: 'passing',
            success: 1
        });
        expect(prChecksCalls(harness)).toHaveLength(1);
    });

    it('classifies gh pr checks rows as it classifies the rollup', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks([
            // Failed, and its re-run is still going
            { __typename: 'CheckRun', conclusion: 'FAILURE', name: 'test', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'CI' },
            { __typename: 'CheckRun', conclusion: '', name: 'test', startedAt: '2026-10-14T10:20:00Z', status: 'IN_PROGRESS', workflowName: 'CI' },
            { __typename: 'CheckRun', conclusion: 'SKIPPED', name: 'docs', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'CI' },
            { __typename: 'CheckRun', conclusion: 'CANCELLED', name: 'deploy', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'CI' },
            { __typename: 'CheckRun', conclusion: 'STARTUP_FAILURE', name: 'release', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'Release' }
        ]));
        // A check run's state is its conclusion once it has completed, and its
        // status before that
        harness.ghResponses.push(JSON.stringify([
            { state: 'IN_PROGRESS' },
            { state: 'SKIPPED' },
            { state: 'CANCELLED' },
            { state: 'STARTUP_FAILURE' }
        ]));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual({
            failing: 2,
            pending: 1,
            state: 'failing',
            success: 0
        });
    });

    // The rollup has no event field, so a workflow's push and pull_request runs
    // look like runs of one check. GitHub lists them as two checks.
    it('keeps a workflow\'s push and pull_request runs apart, as gh pr checks does', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks([
            // push
            { __typename: 'CheckRun', conclusion: 'FAILURE', name: 'test', startedAt: '2026-10-14T10:00:00Z', status: 'COMPLETED', workflowName: 'CI' },
            // pull_request, then its re-run
            { __typename: 'CheckRun', conclusion: 'FAILURE', name: 'test', startedAt: '2026-10-14T10:00:05Z', status: 'COMPLETED', workflowName: 'CI' },
            { __typename: 'CheckRun', conclusion: 'SUCCESS', name: 'test', startedAt: '2026-10-14T10:20:00Z', status: 'COMPLETED', workflowName: 'CI' }
        ]));
        // The newest pull_request run, and the push run
        harness.ghResponses.push(JSON.stringify([{ state: 'SUCCESS' }, { state: 'FAILURE' }]));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual({
            failing: 1,
            pending: 0,
            state: 'failing',
            success: 1
        });
    });

    // gh added --json to pr checks in 2.50
    it('keeps the rollup\'s counts when gh is too old for pr checks --json', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks(RERUN_ROLLUP));
        harness.ghResponses.push(new Error('unknown flag: --json'));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual(RERUN_ROLLUP_COUNTS);
        expect(prChecksCalls(harness)).toHaveLength(1);
    });

    it('keeps the rollup\'s counts when gh pr checks prints no rows', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks(RERUN_ROLLUP));
        harness.ghResponses.push('[]');

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual(RERUN_ROLLUP_COUNTS);
        expect(prChecksCalls(harness)).toHaveLength(1);
    });

    it('makes no gh pr checks call when the rollup repeats no check', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(prWithChecks([
            { __typename: 'CheckRun', conclusion: 'SUCCESS', name: 'build', status: 'COMPLETED', workflowName: 'CI' },
            { __typename: 'CheckRun', conclusion: 'SUCCESS', name: 'build', status: 'COMPLETED', workflowName: 'Release' },
            { __typename: 'StatusContext', context: 'build', state: 'SUCCESS' },
            { conclusion: 'SUCCESS', status: 'COMPLETED' },
            { conclusion: 'SUCCESS', status: 'COMPLETED' }
        ]));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual({
            failing: 0,
            pending: 0,
            state: 'passing',
            success: 5
        });
        expect(prChecksCalls(harness)).toHaveLength(0);
    });

    it('passes the pinned --repo to gh pr checks', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/fork-owner/example-repo.git');
        harness.ghResponses.push('');
        harness.ghResponses.push(prWithChecks(RERUN_ROLLUP));
        harness.ghResponses.push(RERUN_CHECK_ROWS);

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks?.state).toBe('passing');
        expect(prChecksCalls(harness).map(call => call.args)).toEqual([
            ['pr', 'checks', '--repo', 'https://github.com/fork-owner/example-repo', '--json', 'state', '--', '42']
        ]);
    });

    it('gives gh pr checks only what is left of the lookup\'s budget', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghDurations.push(3_000);
        harness.ghResponses.push(prWithChecks(RERUN_ROLLUP));
        harness.ghResponses.push(RERUN_CHECK_ROWS);

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks?.state).toBe('passing');
        expect(prChecksCalls(harness).map(call => call.timeout)).toEqual([2_000]);
    });

    it('keeps the rollup\'s counts without a gh pr checks call once the lookup\'s budget is spent', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghDurations.push(5_000);
        harness.ghResponses.push(prWithChecks(RERUN_ROLLUP));
        harness.ghResponses.push(RERUN_CHECK_ROWS);

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })?.checks).toEqual(RERUN_ROLLUP_COUNTS);
        expect(prChecksCalls(harness)).toHaveLength(0);
    });

    // A branch named like a flag (a planted HEAD can say `ref: refs/heads/--web`)
    // must stay an argument
    it('passes the branch to gh after --, so it can\'t become a flag', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/fork-owner/example-repo.git');
        harness.setCurrentRef('--web');
        harness.ghResponses.push('');
        harness.ghResponses.push('');

        fetchGitReviewData('/tmp/repo', harness.deps);

        const pinned = harness.execCalls.filter(call => call.cmd === 'gh' && call.args[0] === 'pr' && call.args.includes('--repo'));
        expect(pinned.length).toBeGreaterThan(0);
        for (const call of pinned) {
            expect(call.args.slice(-2)).toEqual(['--', '--web']);
        }
    });

    it('passes the branch to glab after --, so it can\'t become a flag', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.com:fork-owner/repo.git');
        harness.setGlabAvailable(true);
        harness.setCurrentRef('--web');
        harness.glabResponses.push('');
        harness.glabResponses.push('');

        fetchGitReviewData('/tmp/repo', harness.deps);

        const pinned = harness.execCalls.filter(call => call.cmd === 'glab' && call.args[0] === 'mr' && call.args.includes('--repo'));
        expect(pinned.length).toBeGreaterThan(0);
        for (const call of pinned) {
            expect(call.args.slice(-2)).toEqual(['--', '--web']);
        }
    });

    // With a tag of the same name, `git symbolic-ref --short HEAD` says
    // `heads/<branch>`, a branch no PR is on
    it('pins gh to the branch\'s own name when a tag has the same name', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/fork-owner/example-repo.git');
        harness.addTag('feature/cache-a');
        harness.ghResponses.push('');
        harness.ghResponses.push('');

        fetchGitReviewData('/tmp/repo', harness.deps);

        const pinned = harness.execCalls.filter(call => call.cmd === 'gh' && call.args[0] === 'pr' && call.args.includes('--repo'));
        expect(pinned.map(call => call.args.slice(-2))).toEqual([['--', 'feature/cache-a']]);
    });

    it('pins glab to the branch\'s own name when a tag has the same name', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.com:fork-owner/repo.git');
        harness.setGlabAvailable(true);
        harness.addTag('feature/cache-a');
        harness.glabResponses.push('');
        harness.glabResponses.push('');

        fetchGitReviewData('/tmp/repo', harness.deps);

        const pinned = harness.execCalls.filter(call => call.cmd === 'glab' && call.args[0] === 'mr' && call.args.includes('--repo'));
        expect(pinned.map(call => call.args.slice(-2))).toEqual([['--', 'feature/cache-a']]);
    });

    it('passes the SSH host after --, so a host named like an option stays a host', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@-oProxyCommand=x:owner/repo.git');

        fetchGitReviewData('/tmp/repo', harness.deps);

        const sshCalls = harness.execCalls.filter(call => call.cmd === 'ssh');
        // The remote parser lowercases hosts
        expect(sshCalls.map(call => call.args)).toEqual(sshCalls.map(() => ['-G', '--', '-oproxycommand=x']));
        expect(sshCalls.length).toBeGreaterThan(0);
    });

    it('falls back to --repo <origin> for forked GitHub repos when gh\'s default resolves elsewhere', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/fork-owner/example-repo.git');
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Forked PR',
            url: 'https://github.com/fork-owner/example-repo/pull/1'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 1,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Forked PR',
            url: 'https://github.com/fork-owner/example-repo/pull/1'
        });

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[0]?.args).not.toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/fork-owner/example-repo');
        expect(ghPrCalls[1]?.args).toContain('feature/cache-a');
    });

    it('reuses the pinned PR target for the metadata-only compatibility retry', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/fork-owner/example-repo.git');
        harness.ghResponses.push('');
        harness.ghResponses.push(new Error('statusCheckRollup is unavailable'));
        harness.ghResponses.push(JSON.stringify({
            number: 1,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Forked PR',
            url: 'https://github.com/fork-owner/example-repo/pull/1'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps, { includeChecks: true })).toEqual({
            number: 1,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Forked PR',
            url: 'https://github.com/fork-owner/example-repo/pull/1'
        });

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(3);
        expect(withoutJsonFields(ghPrCalls[1]?.args)).toEqual(withoutJsonFields(ghPrCalls[2]?.args));
        expect(ghPrCalls[1]?.args).toContain('feature/cache-a');
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/fork-owner/example-repo');
        expect(jsonFields(ghPrCalls[2]?.args)).toBe('url,number,title,state,reviewDecision');
    });

    it('resolves SSH host aliases before selecting GitHub and pinning --repo', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@mygit:owner/repo.git');
        harness.setSshHostAlias('mygit', 'github.com');
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1485,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Alias PR',
            url: 'https://github.com/owner/repo/pull/1485'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 1485,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Alias PR',
            url: 'https://github.com/owner/repo/pull/1485'
        });

        const sshCalls = harness.execCalls.filter(call => call.cmd === 'ssh');
        expect(sshCalls.length).toBeGreaterThan(0);
        expect(sshCalls.every(call => call.args.join(' ') === '-G -- mygit')).toBe(true);

        const ghAuthCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'auth'
        );
        expect(ghAuthCalls).toHaveLength(0);

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[0]?.args).not.toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/owner/repo');
    });

    it('preserves canonical GitHub SSH hosts when SSH config points at a transport endpoint', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@github.com:owner/repo.git');
        harness.setSshHostAlias('github.com', 'ssh.github.com');
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1486,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Canonical GitHub PR',
            url: 'https://github.com/owner/repo/pull/1486'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 1486,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Canonical GitHub PR',
            url: 'https://github.com/owner/repo/pull/1486'
        });

        const sshCalls = harness.execCalls.filter(call => call.cmd === 'ssh');
        expect(sshCalls).toHaveLength(0);

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/owner/repo');
        expect(ghPrCalls[1]?.args).not.toContain('https://ssh.github.com/owner/repo');
    });

    it('preserves canonical GitLab SSH hosts when SSH config points at a transport endpoint', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.com:owner/repo.git');
        harness.setSshHostAlias('gitlab.com', 'altssh.gitlab.com');
        harness.setGlabAvailable(true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 78,
            state: 'opened',
            title: 'Canonical GitLab MR',
            web_url: 'https://gitlab.com/owner/repo/-/merge_requests/78'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 78,
            provider: 'glab',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Canonical GitLab MR',
            url: 'https://gitlab.com/owner/repo/-/merge_requests/78'
        });

        const sshCalls = harness.execCalls.filter(call => call.cmd === 'ssh');
        expect(sshCalls).toHaveLength(0);

        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('--repo');
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.com/owner/repo');
        expect(glabMrCalls[1]?.args).not.toContain('https://altssh.gitlab.com/owner/repo');
    });

    // The usual way to use two GitHub accounts: `Host github-work` with
    // `HostName github.com` in ~/.ssh/config
    it('resolves SSH host aliases that name GitHub before pinning --repo', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@github-work:owner/repo.git');
        harness.setSshHostAlias('github-work', 'github.com');
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1487,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Work account PR',
            url: 'https://github.com/owner/repo/pull/1487'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(1487);

        const sshCalls = harness.execCalls.filter(call => call.cmd === 'ssh');
        expect(sshCalls.length).toBeGreaterThan(0);
        expect(sshCalls.every(call => call.args.join(' ') === '-G -- github-work')).toBe(true);

        const ghAuthCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'auth'
        );
        expect(ghAuthCalls).toHaveLength(0);

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/owner/repo');
    });

    // glab is logged in to neither name, and a host without a dot reads as an
    // alias
    it('resolves SSH host aliases that name GitLab before pinning --repo', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab-corp:team/repo.git');
        harness.setSshHostAlias('gitlab-corp', 'gitlab.corp.example');
        harness.setGlabAvailable(true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 11,
            state: 'opened',
            title: 'Corp MR',
            web_url: 'https://gitlab.corp.example/team/repo/-/merge_requests/11'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(11);

        expect(authProbes(harness)).toEqual([
            'glab auth status --hostname gitlab-corp',
            'glab auth status --hostname gitlab.corp.example'
        ]);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('--repo');
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.corp.example/team/repo');
    });

    it('keeps a self-hosted forge host that SSH config routes to an address naming no forge', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.example.com:team/repo.git');
        harness.setSshHostAlias('gitlab.example.com', '10.0.0.5');
        harness.setGlabAvailable(true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 12,
            state: 'opened',
            title: 'Self-hosted MR',
            web_url: 'https://gitlab.example.com/team/repo/-/merge_requests/12'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.provider).toBe('glab');

        expect(harness.execCalls.filter(call => call.args[0] === 'auth')).toHaveLength(0);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.example.com/team/repo');
    });

    // HTTPS can sit behind a proxy that doesn't carry SSH, so SSH config sends
    // the forge's hostname to a separate SSH-only endpoint. glab is logged in to
    // neither name, and a host with a dot reads as a hostname.
    it('keeps a self-hosted GitLab host that SSH config routes to an SSH-only endpoint naming GitLab', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.corp.example:team/repo.git');
        harness.setSshHostAlias('gitlab.corp.example', 'gitlab-ssh.corp.example');
        harness.setGlabAvailable(true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 42,
            state: 'opened',
            title: 'Proxied MR',
            web_url: 'https://gitlab.corp.example/team/repo/-/merge_requests/42'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(42);

        expect(authProbes(harness)).toEqual([
            'glab auth status --hostname gitlab.corp.example',
            'glab auth status --hostname gitlab-ssh.corp.example'
        ]);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.corp.example/team/repo');
        expect(glabMrCalls[1]?.args).not.toContain('https://gitlab-ssh.corp.example/team/repo');
    });

    // gh is logged in to neither name
    it('keeps a GitHub Enterprise host that SSH config routes to an SSH-only endpoint naming GitHub', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@github.corp.example:owner/repo.git');
        harness.setSshHostAlias('github.corp.example', 'github-ssh.corp.example');
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1488,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Enterprise PR',
            url: 'https://github.corp.example/owner/repo/pull/1488'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(1488);

        expect(authProbes(harness)).toEqual([
            'gh auth status --hostname github.corp.example',
            'gh auth status --hostname github-ssh.corp.example'
        ]);
        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[1]?.args).toContain('https://github.corp.example/owner/repo');
        expect(ghPrCalls[1]?.args).not.toContain('https://github-ssh.corp.example/owner/repo');
    });

    // `Host github.com-personal` with `HostName ssh.github.com` and `Port 443`
    // reaches GitHub through networks that block port 22
    it('pins github.com for an SSH host alias that routes through GitHub\'s transport endpoint', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@github.com-personal:owner/repo.git');
        harness.setSshHostAlias('github.com-personal', 'ssh.github.com');
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1489,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Personal account PR',
            url: 'https://github.com/owner/repo/pull/1489'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(1489);

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/owner/repo');
    });

    // A short hostname reached through a DNS search domain has no dot either
    it('keeps a short GitLab hostname that glab is logged in to when SSH config routes it to an SSH-only endpoint', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab:team/repo.git');
        harness.setSshHostAlias('gitlab', 'gitlab-ssh.corp.example');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'gitlab', true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 43,
            state: 'opened',
            title: 'Short host MR',
            web_url: 'https://gitlab/team/repo/-/merge_requests/43'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(43);

        expect(authProbes(harness)).toEqual(['glab auth status --hostname gitlab']);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('https://gitlab/team/repo');
        expect(glabMrCalls[1]?.args).not.toContain('https://gitlab-ssh.corp.example/team/repo');
    });

    it('keeps a self-hosted GitLab host that glab is logged in to when SSH config routes it to an SSH-only endpoint', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.corp.example:team/repo.git');
        harness.setSshHostAlias('gitlab.corp.example', 'gitlab-ssh.corp.example');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'gitlab.corp.example', true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 44,
            state: 'opened',
            title: 'Proxied MR',
            web_url: 'https://gitlab.corp.example/team/repo/-/merge_requests/44'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(44);

        expect(authProbes(harness)).toEqual(['glab auth status --hostname gitlab.corp.example']);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.corp.example/team/repo');
    });

    it('pins the host a GitLab alias resolves to when glab is logged in to that host', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab-corp:team/repo.git');
        harness.setSshHostAlias('gitlab-corp', 'gitlab.corp.example');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'gitlab.corp.example', true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 45,
            state: 'opened',
            title: 'Corp MR',
            web_url: 'https://gitlab.corp.example/team/repo/-/merge_requests/45'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(45);

        expect(authProbes(harness)).toEqual([
            'glab auth status --hostname gitlab-corp',
            'glab auth status --hostname gitlab.corp.example'
        ]);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.corp.example/team/repo');
    });

    // `Host github.com-work` with `HostName github.corp.example`: an alias can
    // have a dot too
    it('pins the GitHub Enterprise host a dotted alias resolves to when gh is logged in to that host', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@github.com-work:owner/repo.git');
        harness.setSshHostAlias('github.com-work', 'github.corp.example');
        harness.setCliAuthedForHost('gh', 'github.corp.example', true);
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1490,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Enterprise PR',
            url: 'https://github.corp.example/owner/repo/pull/1490'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(1490);

        expect(authProbes(harness)).toEqual([
            'gh auth status --hostname github.com-work',
            'gh auth status --hostname github.corp.example'
        ]);
        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
        expect(ghPrCalls[1]?.args).toContain('https://github.corp.example/owner/repo');
        expect(ghPrCalls[1]?.args).not.toContain('https://github.com-work/owner/repo');
    });

    it('asks the CLI about each name once per lookup, and again on the next lookup', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab-corp:team/repo.git');
        harness.setSshHostAlias('gitlab-corp', 'gitlab.corp.example');
        harness.setGlabAvailable(true);
        harness.glabResponses.push('', '');

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        const probes = [
            'glab auth status --hostname gitlab-corp',
            'glab auth status --hostname gitlab.corp.example'
        ];
        expect(authProbes(harness)).toEqual(probes);
        expect(harness.execCalls.filter(call => call.cmd === 'ssh')).toHaveLength(1);

        harness.advanceNow(30_001);
        harness.glabResponses.push('', '');
        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        expect(authProbes(harness)).toEqual([...probes, ...probes]);
    });

    // `auth status` checks the token with the server, as for a host naming no
    // forge
    it('starts the lookup deadline after the auth probes for a forge-named alias', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab-corp:team/repo.git');
        harness.setSshHostAlias('gitlab-corp', 'gitlab.corp.example');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'gitlab.corp.example', true);
        harness.authDurations.push(2_600, 2_600);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 46,
            state: 'opened',
            title: 'Corp MR',
            web_url: 'https://gitlab.corp.example/team/repo/-/merge_requests/46'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(46);

        expect(authProbes(harness)).toHaveLength(2);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls.map(call => call.timeout)).toEqual([5_000, 5_000]);
    });

    it('asks no CLI about its logins when SSH config leaves a self-hosted forge host as it is', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.corp.example:team/repo.git');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'gitlab.corp.example', true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 47,
            state: 'opened',
            title: 'Self-hosted MR',
            web_url: 'https://gitlab.corp.example/team/repo/-/merge_requests/47'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(47);

        expect(authProbes(harness)).toEqual([]);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.corp.example/team/repo');
    });

    it('asks gh about no logins for a github.com SSH remote', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@github.com:owner/repo.git');
        harness.setCliAuthedForHost('gh', 'github.com', true);
        harness.ghResponses.push('');
        harness.ghResponses.push(JSON.stringify({
            number: 1491,
            reviewDecision: '',
            state: 'OPEN',
            title: 'GitHub PR',
            url: 'https://github.com/owner/repo/pull/1491'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)?.number).toBe(1491);

        expect(authProbes(harness)).toEqual([]);
    });

    it('falls back to --repo <origin> for forked GitLab repos when glab\'s default resolves elsewhere', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@gitlab.com:fork-owner/example-fork.git');
        harness.setGlabAvailable(true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 9,
            state: 'opened',
            title: 'Forked MR',
            web_url: 'https://gitlab.com/fork-owner/example-fork/-/merge_requests/9'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 9,
            provider: 'glab',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Forked MR',
            url: 'https://gitlab.com/fork-owner/example-fork/-/merge_requests/9'
        });

        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[0]?.args).not.toContain('--repo');
        expect(glabMrCalls[1]?.args).toContain('--repo');
        expect(glabMrCalls[1]?.args).toContain('https://gitlab.com/fork-owner/example-fork');
        expect(glabMrCalls[1]?.args).toContain('feature/cache-a');
    });

    it('uses glab for unknown host when only glab is authed', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@git.self-hosted.example:team/repo.git');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'git.self-hosted.example', true);
        harness.glabResponses.push(JSON.stringify({
            iid: 5,
            state: 'opened',
            title: 'Self-hosted MR',
            web_url: 'https://git.self-hosted.example/team/repo/-/merge_requests/5'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 5,
            provider: 'glab',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Self-hosted MR',
            url: 'https://git.self-hosted.example/team/repo/-/merge_requests/5'
        });

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(0);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(1);
    });

    it('preserves non-default ports when probing and pinning self-hosted GitLab repos', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://git.self-hosted.example:8443/team/repo.git');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'git.self-hosted.example:8443', true);
        harness.glabResponses.push('');
        harness.glabResponses.push(JSON.stringify({
            iid: 8,
            state: 'opened',
            title: 'Port-hosted MR',
            web_url: 'https://git.self-hosted.example:8443/team/repo/-/merge_requests/8'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 8,
            provider: 'glab',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Port-hosted MR',
            url: 'https://git.self-hosted.example:8443/team/repo/-/merge_requests/8'
        });

        const glabAuthCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'auth'
        );
        expect(glabAuthCalls[0]?.args).toEqual([
            'auth',
            'status',
            '--hostname',
            'git.self-hosted.example:8443'
        ]);

        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(2);
        expect(glabMrCalls[1]?.args).toContain('--repo');
        expect(glabMrCalls[1]?.args).toContain('https://git.self-hosted.example:8443/team/repo');
    });

    it('uses gh for unknown host when only gh is authed (no wasted glab mr calls)', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@git.self-hosted.example:team/repo.git');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('gh', 'git.self-hosted.example', true);
        harness.ghResponses.push(JSON.stringify({
            number: 7,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Self-hosted GHE PR',
            url: 'https://git.self-hosted.example/team/repo/pull/7'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 7,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Self-hosted GHE PR',
            url: 'https://git.self-hosted.example/team/repo/pull/7'
        });

        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(0);
        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(1);
    });

    // `auth status` checks the token with the server, so on a slow link the two
    // probes together can take longer than the lookup's whole budget
    it('starts the lookup deadline after the auth probes for an unknown host', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@git.self-hosted.example:team/repo.git');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('gh', 'git.self-hosted.example', true);
        harness.authDurations.push(2_600, 2_600);
        harness.ghResponses.push(JSON.stringify({
            number: 7,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Self-hosted GHE PR',
            url: 'https://git.self-hosted.example/team/repo/pull/7'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 7,
            provider: 'gh',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Self-hosted GHE PR',
            url: 'https://git.self-hosted.example/team/repo/pull/7'
        });

        const authCalls = harness.execCalls.filter(call => call.args[0] === 'auth');
        expect(authCalls.map(call => call.cmd)).toEqual(['glab', 'gh']);
        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(1);
    });

    it('returns null for unknown host when neither CLI is authed', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@git.self-hosted.example:team/repo.git');
        harness.setGlabAvailable(true);

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(0);
        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(0);
        const cachedMissEntry = [...harness.cacheFiles.values()].at(0);
        expect(JSON.parse(cachedMissEntry?.content ?? '')).toEqual({
            checksQueried: true,
            data: null,
            version: 1
        });
    });

    it('prefers glab over gh for unknown host when both CLIs are authed', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('git@git.self-hosted.example:team/repo.git');
        harness.setGlabAvailable(true);
        harness.setCliAuthedForHost('glab', 'git.self-hosted.example', true);
        harness.setCliAuthedForHost('gh', 'git.self-hosted.example', true);
        harness.glabResponses.push(JSON.stringify({
            iid: 3,
            state: 'opened',
            title: 'Ambiguous MR',
            web_url: 'https://git.self-hosted.example/team/repo/-/merge_requests/3'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
            number: 3,
            provider: 'glab',
            reviewDecision: '',
            state: 'OPEN',
            title: 'Ambiguous MR',
            url: 'https://git.self-hosted.example/team/repo/-/merge_requests/3'
        });

        const ghPrCalls = harness.execCalls.filter(
            call => call.cmd === 'gh' && call.args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(0);
        const glabMrCalls = harness.execCalls.filter(
            call => call.cmd === 'glab' && call.args[0] === 'mr'
        );
        expect(glabMrCalls).toHaveLength(1);
    });

    it('keys the cache through the render context runGit without spawning git for the ref', () => {
        const harness = createHarness();
        const lockPathFromSpawn = prepareCachePath(harness) + '.lock';
        harness.execCalls.length = 0;

        const runGitCalls: string[] = [];
        const deps: GitReviewCacheDeps = {
            ...harness.deps,
            runGit: (command) => {
                runGitCalls.push(command);
                return command === 'symbolic-ref HEAD' ? 'refs/heads/feature/cache-a' : null;
            }
        };

        expect(getCachedGitReviewData('/tmp/repo', { context: { data: { cwd: '/tmp/repo' } } }, deps)).toBeNull();

        expect(runGitCalls).toEqual(['symbolic-ref HEAD']);
        expect(harness.execCalls.filter(call => call.cmd === 'git')).toEqual([]);
        // Same cache file (and so the same lock the refresh child releases)
        // as the uncached lookup.
        expect(harness.cacheFiles.has(lockPathFromSpawn)).toBe(true);
    });

    it('falls back to rev-parse through runGit on a detached HEAD', () => {
        const harness = createHarness();
        harness.setCurrentRef('');
        const lockPathFromSpawn = prepareCachePath(harness) + '.lock';

        const runGitCalls: string[] = [];
        const deps: GitReviewCacheDeps = {
            ...harness.deps,
            runGit: (command) => {
                runGitCalls.push(command);
                return command === 'rev-parse --short HEAD' ? 'abc123' : null;
            }
        };

        getCachedGitReviewData('/tmp/repo', { context: {} }, deps);

        expect(runGitCalls).toEqual(['symbolic-ref HEAD', 'rev-parse --short HEAD']);
        expect(harness.cacheFiles.has(lockPathFromSpawn)).toBe(true);
    });

    // The refresh child writes the cache file of the branch's own name, so the
    // render must read that one, not the file of "heads/<branch>"
    it('keys the cache through runGit by the branch\'s own name when a tag has the same name', () => {
        const harness = createHarness();
        harness.addTag('feature/cache-a');
        const lockPathFromSpawn = prepareCachePath(harness) + '.lock';

        const deps: GitReviewCacheDeps = {
            ...harness.deps,
            runGit: (command) => {
                // As git prints it when a tag shadows the branch
                if (command === 'symbolic-ref HEAD')
                    return 'refs/heads/feature/cache-a';
                if (command === 'symbolic-ref --short HEAD')
                    return 'heads/feature/cache-a';
                return null;
            }
        };

        getCachedGitReviewData('/tmp/repo', { context: { data: { cwd: '/tmp/repo' } } }, deps);

        expect(harness.cacheFiles.has(lockPathFromSpawn)).toBe(true);
    });
});
