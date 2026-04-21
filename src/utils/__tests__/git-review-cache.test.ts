import {
    describe,
    expect,
    it
} from 'vitest';

import {
    fetchGitReviewData,
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
    ghResponses: (Error | string)[];
    glabResponses: (Error | string)[];
    setCurrentRef: (ref: string) => void;
    setOriginRemoteUrl: (url: string) => void;
    setGlabAvailable: (available: boolean) => void;
    setCliAuthedForHost: (cli: 'gh' | 'glab', host: string, authed: boolean) => void;
}

function createHarness(): PrCacheHarness {
    const cacheFiles = new Map<string, FakeCacheFile>();
    const execCalls: { args: string[]; cmd: string; cwd?: string }[] = [];
    const ghResponses: (Error | string)[] = [];
    const glabResponses: (Error | string)[] = [];
    const now = 1_700_000_000_000;
    let currentRef = 'feature/cache-a';
    let originRemoteUrl: string | null = null;
    let glabAvailable = false;
    const authedHosts: Record<'gh' | 'glab', Set<string>> = {
        gh: new Set(),
        glab: new Set()
    };

    const deps: GitReviewCacheDeps = {
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
            if (cmd === 'git' && commandArgs[0] === 'branch')
                return `${currentRef}\n`;
            if (cmd === 'git' && commandArgs[0] === 'rev-parse')
                return 'abc123\n';
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
        existsSync: (filePath => cacheFiles.has(String(filePath))) as GitReviewCacheDeps['existsSync'],
        getHomedir: () => '/tmp/home',
        mkdirSync: (() => undefined) as GitReviewCacheDeps['mkdirSync'],
        now: () => now,
        readFileSync: (filePath => cacheFiles.get(String(filePath))?.content ?? '') as GitReviewCacheDeps['readFileSync'],
        statSync: (filePath => ({ mtimeMs: cacheFiles.get(String(filePath))?.mtimeMs ?? now })) as GitReviewCacheDeps['statSync'],
        writeFileSync: ((filePath, content) => {
            const normalizedContent = typeof content === 'string'
                ? content
                : Buffer.isBuffer(content)
                    ? content.toString('utf8')
                    : '';
            cacheFiles.set(String(filePath), {
                content: normalizedContent,
                mtimeMs: now
            });
        }) as GitReviewCacheDeps['writeFileSync']
    };

    return {
        cacheFiles,
        deps,
        execCalls,
        ghResponses,
        glabResponses,
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
        }
    };
}

describe('git-review-cache', () => {
    it('negative-caches failed gh PR lookups', () => {
        const harness = createHarness();
        harness.ghResponses.push(new Error('no pull request found'));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        const ghCallsAfterFirstRender = harness.execCalls.filter(call => call.cmd === 'gh');
        expect(ghCallsAfterFirstRender).toHaveLength(2);

        const cachedMissEntry = [...harness.cacheFiles.values()].at(0);
        expect(cachedMissEntry?.content).toBe('');

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toBeNull();

        const ghCallsAfterSecondRender = harness.execCalls.filter(call => call.cmd === 'gh');
        expect(ghCallsAfterSecondRender).toHaveLength(2);
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

    it('uses gh\'s default repo resolution when it succeeds (no --repo pin needed)', () => {
        const harness = createHarness();
        harness.setOriginRemoteUrl('https://github.com/example-owner/example-repo.git');
        harness.ghResponses.push(JSON.stringify({
            number: 42,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Standard PR',
            url: 'https://github.com/example-owner/example-repo/pull/42'
        }));

        expect(fetchGitReviewData('/tmp/repo', harness.deps)).toEqual({
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
    });

    it('falls back to --repo <origin> for forked GitHub repos when gh\'s default resolves elsewhere', () => {
        // Simulates the forked-repo case: the CLI's default repo resolution
        // (e.g. `upstream`/parent) returns nothing for the current branch,
        // but the review lives on `origin` (the user's fork). The fallback
        // pass, pinned to origin, finds it.
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
        // `gh pr view --repo` requires an explicit branch argument, so the
        // pinned call must include the current branch as a positional arg.
        expect(ghPrCalls[1]?.args).toContain('feature/cache-a');
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
        // `glab mr view --repo` requires an explicit branch argument.
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
        expect(cachedMissEntry?.content).toBe('');
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
