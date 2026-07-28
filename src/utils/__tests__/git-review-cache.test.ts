import {
    describe,
    expect,
    it
} from 'vitest';

import {
    fetchGitReviewData,
    getCachedGitReviewData,
    refreshGitReviewCacheFromCli,
    type GitReviewCacheDeps
} from '../git-review-cache';

interface FakeCacheFile {
    content: string;
    mtimeMs: number;
}

interface PrCacheHarness {
    cacheFiles: Map<string, FakeCacheFile>;
    deps: GitReviewCacheDeps;
    execCalls: { args: string[]; cmd: string; cwd?: string }[];
    ghDurations: number[];
    ghResponses: (Error | string)[];
    glabResponses: (Error | string)[];
    spawnCalls: { args: string[]; command: string }[];
    advanceNow: (milliseconds: number) => void;
    setCurrentRef: (ref: string) => void;
    setOriginRemoteUrl: (url: string) => void;
    setGlabAvailable: (available: boolean) => void;
    setCliAuthedForHost: (cli: 'gh' | 'glab', host: string, authed: boolean) => void;
    setSshHostAlias: (host: string, hostname: string) => void;
}

function createHarness(): PrCacheHarness {
    const cacheFiles = new Map<string, FakeCacheFile>();
    const execCalls: { args: string[]; cmd: string; cwd?: string }[] = [];
    const ghDurations: number[] = [];
    const ghResponses: (Error | string)[] = [];
    const glabResponses: (Error | string)[] = [];
    const spawnCalls: { args: string[]; command: string }[] = [];
    let now = 1_700_000_000_000;
    let currentRef = 'feature/cache-a';
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
                    : undefined
            });

            if (cmd === 'git' && commandArgs[0] === 'remote') {
                if (originRemoteUrl === null) {
                    throw new Error('no origin configured');
                }
                return `${originRemoteUrl}\n`;
            }
            if (cmd === 'git' && commandArgs[0] === 'symbolic-ref')
                return `${currentRef}\n`;
            if (cmd === 'git' && commandArgs[0] === 'rev-parse')
                return 'abc123\n';
            if (cmd === 'ssh' && commandArgs[0] === '-G') {
                const host = commandArgs[1];
                if (!host)
                    throw new Error('missing ssh host');
                return `hostname ${sshHostAliases.get(host) ?? host}\n`;
            }
            if (cmd === 'gh' && commandArgs[0] === '--version')
                return 'gh version 2.0.0\n';
            if (cmd === 'gh' && commandArgs[0] === 'auth' && commandArgs[1] === 'status') {
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

describe('git-review-cache', () => {
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
        expect(ghPrCalls.every(call => call.args.at(-1) === 'url,number,title,state,reviewDecision')).toBe(true);

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
        expect(ghPrCalls.every(call => call.args.at(-1)?.includes('statusCheckRollup'))).toBe(true);
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
        expect(ghPrCalls[0]?.args.at(-1)).toBe(
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
        expect(ghPrCalls[0]?.args.at(-1)).toBe(
            'url,number,title,state,reviewDecision,statusCheckRollup'
        );
        expect(ghPrCalls[1]?.args.at(-1)).toBe('url,number,title,state,reviewDecision');

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
        expect(ghPrCalls[1]?.args.slice(0, -2)).toEqual(ghPrCalls[2]?.args.slice(0, -2));
        expect(ghPrCalls[1]?.args).toContain('feature/cache-a');
        expect(ghPrCalls[1]?.args).toContain('--repo');
        expect(ghPrCalls[1]?.args).toContain('https://github.com/fork-owner/example-repo');
        expect(ghPrCalls[2]?.args.at(-1)).toBe('url,number,title,state,reviewDecision');
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
        expect(sshCalls.every(call => call.args.join(' ') === '-G mygit')).toBe(true);

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
});
