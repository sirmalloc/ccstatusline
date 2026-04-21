import { execFileSync } from 'child_process';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync
} from 'fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { parseRemoteUrl } from './git-remote';

export type GitReviewProvider = 'gh' | 'glab';

export interface GitReviewData {
    number: number;
    url: string;
    title: string;
    state: string;
    reviewDecision: string;
    // Which CLI produced this record. Optional for backward compatibility
    // with cache files written before this field existed.
    provider?: GitReviewProvider;
}

const GIT_REVIEW_CACHE_TTL = 30_000;
const CLI_TIMEOUT = 5_000;
const DEFAULT_TITLE_MAX_WIDTH = 30;

export interface GitReviewCacheDeps {
    execFileSync: typeof execFileSync;
    existsSync: typeof existsSync;
    mkdirSync: typeof mkdirSync;
    readFileSync: typeof readFileSync;
    statSync: typeof statSync;
    writeFileSync: typeof writeFileSync;
    getHomedir: typeof os.homedir;
    now: typeof Date.now;
}

const DEFAULT_GIT_REVIEW_CACHE_DEPS: GitReviewCacheDeps = {
    execFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
    getHomedir: os.homedir,
    now: Date.now
};

function getCacheDir(deps: GitReviewCacheDeps): string {
    return path.join(deps.getHomedir(), '.cache', 'ccstatusline');
}

function getGitReviewCacheDir(deps: GitReviewCacheDeps): string {
    return path.join(getCacheDir(deps), 'git-review');
}

function runGitForCache(args: string[], cwd: string, deps: GitReviewCacheDeps): string {
    try {
        return deps.execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd,
            timeout: CLI_TIMEOUT
        }).trim();
    } catch {
        return '';
    }
}

function getCurrentBranch(cwd: string, deps: GitReviewCacheDeps): string | null {
    const branch = runGitForCache(['branch', '--show-current'], cwd, deps);
    return branch.length > 0 ? branch : null;
}

function getCacheRef(cwd: string, deps: GitReviewCacheDeps): string {
    const branch = getCurrentBranch(cwd, deps);
    if (branch) {
        return `branch:${branch}`;
    }

    const head = runGitForCache(['rev-parse', '--short', 'HEAD'], cwd, deps);
    if (head.length > 0) {
        return `head:${head}`;
    }

    return 'unknown';
}

function getCachePath(cwd: string, ref: string, deps: GitReviewCacheDeps): string {
    const hash = createHash('sha256')
        .update(cwd)
        .update('\0')
        .update(ref)
        .digest('hex')
        .slice(0, 16);
    return path.join(getGitReviewCacheDir(deps), `git-review-${hash}.json`);
}

function readCache(cachePath: string, deps: GitReviewCacheDeps): GitReviewData | null | 'miss' {
    try {
        if (!deps.existsSync(cachePath)) {
            return 'miss';
        }
        const age = deps.now() - deps.statSync(cachePath).mtimeMs;
        if (age > GIT_REVIEW_CACHE_TTL) {
            return 'miss';
        }
        const content = deps.readFileSync(cachePath, 'utf-8').trim();
        if (content.length === 0) {
            return null;
        }
        const data = JSON.parse(content) as GitReviewData;
        if (typeof data.number !== 'number' || typeof data.url !== 'string') {
            return 'miss';
        }
        return data;
    } catch {
        return 'miss';
    }
}

function writeCache(cachePath: string, data: GitReviewData | null, deps: GitReviewCacheDeps): void {
    try {
        const cacheDir = getGitReviewCacheDir(deps);
        if (!deps.existsSync(cacheDir)) {
            deps.mkdirSync(cacheDir, { recursive: true });
        }
        deps.writeFileSync(cachePath, data ? JSON.stringify(data) : '', 'utf-8');
    } catch {
        // Best-effort caching
    }
}

function getOriginUrl(cwd: string, deps: GitReviewCacheDeps): string | null {
    const url = runGitForCache(['remote', 'get-url', '--', 'origin'], cwd, deps);
    return url.length > 0 ? url : null;
}

function getOriginHost(cwd: string, deps: GitReviewCacheDeps): string | null {
    const url = getOriginUrl(cwd, deps);
    if (!url) {
        return null;
    }
    const parsed = parseRemoteUrl(url);
    return parsed ? parsed.host.toLowerCase() : null;
}

/**
 * Normalize an origin URL to the HTTPS form both `gh` and `glab` accept via
 * their `--repo` flag. Without pinning the repo explicitly, both CLIs may
 * resolve to a different remote (typically the fork parent / `upstream`),
 * silently missing reviews that live on the user's own fork (`origin`).
 */
function toHttpsRepoRef(url: string): string | null {
    const parsed = parseRemoteUrl(url);
    if (!parsed) {
        return null;
    }
    return `https://${parsed.host}/${parsed.owner}/${parsed.repo}`;
}

function getOriginRepoRef(cwd: string, deps: GitReviewCacheDeps): string | null {
    const url = getOriginUrl(cwd, deps);
    return url ? toHttpsRepoRef(url) : null;
}

/**
 * Choose which CLI to use based on the origin remote host. Hostnames that
 * clearly name the forge (e.g. `github.com`, `gitlab.example.com`) are
 * routed directly. For self-hosted hosts whose name contains neither
 * token, probe each CLI with `auth status --hostname <host>` and keep
 * only the CLIs that are authenticated against that host — a signal-
 * based choice rather than a guess. Deterministic ordering (`glab`
 * before `gh`) matters only when both CLIs are authed for the same
 * unknown host.
 *
 * When the origin URL itself is missing or unparseable there is no host
 * to probe, so we return `['gh', 'glab']` and let the CLIs do their own
 * repo resolution from local git config.
 */
function getProviderCandidates(cwd: string, deps: GitReviewCacheDeps): GitReviewProvider[] {
    const host = getOriginHost(cwd, deps);
    if (!host) {
        return ['gh', 'glab'];
    }
    if (host.includes('github')) {
        return ['gh'];
    }
    if (host.includes('gitlab')) {
        return ['glab'];
    }
    const authed: GitReviewProvider[] = [];
    if (isCliAuthedForHost('glab', host, deps)) {
        authed.push('glab');
    }
    if (isCliAuthedForHost('gh', host, deps)) {
        authed.push('gh');
    }
    return authed;
}

function isCliAvailable(cli: GitReviewProvider, deps: GitReviewCacheDeps): boolean {
    try {
        deps.execFileSync(cli, ['--version'], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: CLI_TIMEOUT
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Probe whether `cli` is authenticated against `host`. Both `gh` and
 * `glab` exit 0 on `auth status --hostname <h>` when authed, non-zero
 * otherwise. ENOENT (CLI not installed) also throws, so this doubles
 * as an availability check for the unknown-host branch.
 */
function isCliAuthedForHost(cli: GitReviewProvider, host: string, deps: GitReviewCacheDeps): boolean {
    try {
        deps.execFileSync(cli, ['auth', 'status', '--hostname', host], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: CLI_TIMEOUT
        });
        return true;
    } catch {
        return false;
    }
}

function mapGlabState(state: string): string {
    if (state === 'opened')
        return 'OPEN';
    if (state === 'closed')
        return 'CLOSED';
    if (state === 'merged')
        return 'MERGED';
    if (state === 'locked')
        return 'LOCKED';
    return state.toUpperCase();
}

function fetchFromGh(cwd: string, repoRef: string | null, deps: GitReviewCacheDeps): GitReviewData | null {
    const args = ['pr', 'view'];
    if (repoRef) {
        // `gh pr view --repo <r>` requires an explicit positional argument
        // — unlike plain `gh pr view`, it does not fall back to the current
        // branch. Pass the branch name so gh looks up the matching PR on the
        // pinned repo.
        const branch = getCurrentBranch(cwd, deps);
        if (!branch) {
            return null;
        }
        args.push(branch, '--repo', repoRef);
    }
    args.push('--json', 'url,number,title,state,reviewDecision');

    const output = deps.execFileSync(
        'gh',
        args,
        {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd,
            timeout: CLI_TIMEOUT
        }
    ).trim();

    if (output.length === 0) {
        return null;
    }

    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (typeof parsed.number !== 'number' || typeof parsed.url !== 'string') {
        return null;
    }
    return {
        number: parsed.number,
        url: parsed.url,
        title: typeof parsed.title === 'string' ? parsed.title : '',
        state: typeof parsed.state === 'string' ? parsed.state : '',
        reviewDecision: typeof parsed.reviewDecision === 'string' ? parsed.reviewDecision : '',
        provider: 'gh'
    };
}

function fetchFromGlab(cwd: string, repoRef: string | null, deps: GitReviewCacheDeps): GitReviewData | null {
    const args = ['mr', 'view'];
    if (repoRef) {
        // `glab mr view --repo <r>` requires an explicit positional argument
        // (id or branch), mirroring gh's `--repo` behavior.
        const branch = getCurrentBranch(cwd, deps);
        if (!branch) {
            return null;
        }
        args.push(branch, '--repo', repoRef);
    }
    args.push('--output', 'json');

    const output = deps.execFileSync(
        'glab',
        args,
        {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd,
            timeout: CLI_TIMEOUT
        }
    ).trim();

    if (output.length === 0) {
        return null;
    }

    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (typeof parsed.iid !== 'number' || typeof parsed.web_url !== 'string') {
        return null;
    }
    return {
        number: parsed.iid,
        url: parsed.web_url,
        title: typeof parsed.title === 'string' ? parsed.title : '',
        state: typeof parsed.state === 'string' ? mapGlabState(parsed.state) : '',
        // GitLab approval model differs from GitHub review decisions — leave blank.
        reviewDecision: '',
        provider: 'glab'
    };
}

/**
 * Try both lookup strategies for the given provider, in this order:
 *
 * 1. Without `--repo` — uses the CLI's own repo resolution. This is what
 *    most users expect; it works for any standard single-remote repo and
 *    respects the user's `gh repo set-default` / `glab repo set-default`
 *    choice when multiple remotes exist.
 * 2. With `--repo <origin-url>` — pins the query to the origin remote. This
 *    catches the forked-repo case where the CLI auto-resolves to the parent
 *    (upstream) and would otherwise miss a review that lives on the fork.
 *
 * Every value passed to `--repo` is derived per-repo from the live
 * `git remote` output at call time — nothing is hard-coded.
 */
function fetchFromProvider(provider: GitReviewProvider, cwd: string, repoRef: string | null, deps: GitReviewCacheDeps): GitReviewData | null {
    const fetchFn = provider === 'gh' ? fetchFromGh : fetchFromGlab;

    try {
        const unpinned = fetchFn(cwd, null, deps);
        if (unpinned) {
            return unpinned;
        }
    } catch {
        // Fall through to the origin-pinned attempt.
    }

    if (repoRef) {
        return fetchFn(cwd, repoRef, deps);
    }
    return null;
}

export function fetchGitReviewData(cwd: string, deps: GitReviewCacheDeps = DEFAULT_GIT_REVIEW_CACHE_DEPS): GitReviewData | null {
    const cachePath = getCachePath(cwd, getCacheRef(cwd, deps), deps);
    const cached = readCache(cachePath, deps);
    if (cached !== 'miss') {
        return cached;
    }

    const repoRef = getOriginRepoRef(cwd, deps);

    for (const provider of getProviderCandidates(cwd, deps)) {
        if (!isCliAvailable(provider, deps)) {
            continue;
        }
        try {
            const data = fetchFromProvider(provider, cwd, repoRef, deps);
            if (data) {
                writeCache(cachePath, data, deps);
                return data;
            }
        } catch {
            // Fall through to the next provider (if any).
        }
    }

    writeCache(cachePath, null, deps);
    return null;
}

export function getGitReviewStatusLabel(state: string, reviewDecision: string): string {
    if (state === 'MERGED')
        return 'MERGED';
    if (state === 'CLOSED')
        return 'CLOSED';
    if (reviewDecision === 'APPROVED')
        return 'APPROVED';
    if (reviewDecision === 'CHANGES_REQUESTED')
        return 'CHANGES_REQ';
    if (state === 'OPEN')
        return 'OPEN';
    return state;
}

export function truncateTitle(title: string, maxWidth?: number): string {
    const limit = maxWidth ?? DEFAULT_TITLE_MAX_WIDTH;
    if (title.length <= limit)
        return title;
    return `${title.slice(0, limit - 1)}…`;
}
