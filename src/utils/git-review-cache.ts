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

export type GitCiState = 'passing' | 'failing' | 'pending';

export interface GitCiChecks {
    state: GitCiState;
    failing: number;
    pending: number;
    success: number;
}

export interface GitReviewData {
    number: number;
    url: string;
    title: string;
    state: string;
    reviewDecision: string;
    provider?: GitReviewProvider;
    checks?: GitCiChecks;
}

type CiCheckKind = 'success' | 'failed' | 'pending' | 'ignored';

function readField(entry: Record<string, unknown>, key: string): string {
    const value = entry[key];
    return typeof value === 'string' ? value.toUpperCase() : '';
}

// Classify a single gh statusCheckRollup entry. CheckRun entries carry a
// `status` (COMPLETED once done) plus a `conclusion`; older StatusContext
// entries carry only a `state`. NEUTRAL/SKIPPED are non-blocking noise and
// map to `ignored` so they drop out of the displayed counts.
function classifyCheck(entry: Record<string, unknown>): CiCheckKind {
    if (typeof entry.status === 'string') {
        if (entry.status.toUpperCase() !== 'COMPLETED')
            return 'pending';
        const conclusion = readField(entry, 'conclusion');
        if (conclusion === 'SUCCESS')
            return 'success';
        if (conclusion === 'NEUTRAL' || conclusion === 'SKIPPED')
            return 'ignored';
        return 'failed';
    }
    const state = readField(entry, 'state');
    if (state === 'SUCCESS')
        return 'success';
    if (state === 'PENDING' || state === 'EXPECTED')
        return 'pending';
    return 'failed';
}

export function computeCiRollup(rollup: unknown): GitCiChecks | null {
    if (!Array.isArray(rollup) || rollup.length === 0)
        return null;

    let failing = 0;
    let pending = 0;
    let success = 0;
    let seen = 0;
    for (const entry of rollup) {
        if (typeof entry !== 'object' || entry === null)
            continue;
        seen++;
        const kind = classifyCheck(entry as Record<string, unknown>);
        if (kind === 'failed')
            failing++;
        else if (kind === 'pending')
            pending++;
        else if (kind === 'success')
            success++;
    }

    if (seen === 0)
        return null;

    const state: GitCiState = failing > 0 ? 'failing' : pending > 0 ? 'pending' : 'passing';
    return { state, failing, pending, success };
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
            timeout: CLI_TIMEOUT,
            windowsHide: true
        }).trim();
    } catch {
        return '';
    }
}

function getCurrentBranch(cwd: string, deps: GitReviewCacheDeps): string | null {
    const branch = runGitForCache(['symbolic-ref', '--short', 'HEAD'], cwd, deps);
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

function isSshRemoteUrl(url: string): boolean {
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith('ssh://') || !trimmed.includes('://');
}

function resolveSshHostAlias(host: string, deps: GitReviewCacheDeps): string {
    try {
        const output = deps.execFileSync('ssh', ['-G', host], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: CLI_TIMEOUT,
            windowsHide: true
        }).trim();

        for (const line of output.split(/\r?\n/)) {
            const match = /^hostname\s+(.+)$/i.exec(line.trim());
            if (match?.[1]) {
                return match[1].toLowerCase();
            }
        }
    } catch {
        // Leave the parsed remote host unchanged when ssh is unavailable or
        // cannot resolve the alias.
    }

    return host.toLowerCase();
}

function getNamedForgeProvider(host: string): GitReviewProvider | null {
    if (host.includes('github')) {
        return 'gh';
    }
    if (host.includes('gitlab')) {
        return 'glab';
    }
    return null;
}

function getEffectiveRemoteHost(url: string, host: string, deps: GitReviewCacheDeps): string {
    const normalizedHost = host.toLowerCase();
    if (!isSshRemoteUrl(url) || getNamedForgeProvider(normalizedHost)) {
        return normalizedHost;
    }

    return resolveSshHostAlias(normalizedHost, deps);
}

function getOriginHost(cwd: string, deps: GitReviewCacheDeps): string | null {
    const url = getOriginUrl(cwd, deps);
    if (!url) {
        return null;
    }
    const parsed = parseRemoteUrl(url);
    return parsed ? getEffectiveRemoteHost(url, parsed.host, deps) : null;
}

function toHttpsRepoRef(url: string, deps: GitReviewCacheDeps): string | null {
    const parsed = parseRemoteUrl(url);
    if (!parsed) {
        return null;
    }
    return `https://${getEffectiveRemoteHost(url, parsed.host, deps)}/${parsed.owner}/${parsed.repo}`;
}

function getOriginRepoRef(cwd: string, deps: GitReviewCacheDeps): string | null {
    const url = getOriginUrl(cwd, deps);
    return url ? toHttpsRepoRef(url, deps) : null;
}

// Self-hosted hosts that name neither forge are resolved by probing each CLI's
// `auth status --hostname <host>` and keeping those that are authed.
function getProviderCandidates(cwd: string, deps: GitReviewCacheDeps): GitReviewProvider[] {
    const host = getOriginHost(cwd, deps);
    if (!host) {
        return ['gh', 'glab'];
    }
    const namedForgeProvider = getNamedForgeProvider(host);
    if (namedForgeProvider) {
        return [namedForgeProvider];
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
            timeout: CLI_TIMEOUT,
            windowsHide: true
        });
        return true;
    } catch {
        return false;
    }
}

function isCliAuthedForHost(cli: GitReviewProvider, host: string, deps: GitReviewCacheDeps): boolean {
    try {
        deps.execFileSync(cli, ['auth', 'status', '--hostname', host], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: CLI_TIMEOUT,
            windowsHide: true
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
        // `--repo` disables branch auto-resolution, so pass the branch explicitly.
        const branch = getCurrentBranch(cwd, deps);
        if (!branch) {
            return null;
        }
        args.push(branch, '--repo', repoRef);
    }
    args.push('--json', 'url,number,title,state,reviewDecision,statusCheckRollup');

    const output = deps.execFileSync(
        'gh',
        args,
        {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd,
            timeout: CLI_TIMEOUT,
            windowsHide: true
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
        provider: 'gh',
        checks: computeCiRollup(parsed.statusCheckRollup) ?? undefined
    };
}

function fetchFromGlab(cwd: string, repoRef: string | null, deps: GitReviewCacheDeps): GitReviewData | null {
    const args = ['mr', 'view'];
    if (repoRef) {
        // `--repo` disables branch auto-resolution, so pass the branch explicitly.
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
            timeout: CLI_TIMEOUT,
            windowsHide: true
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
        reviewDecision: '',
        provider: 'glab'
    };
}

// First try the CLI's own repo resolution, then fall back to pinning `--repo`
// to origin. The pinned pass catches forks where the CLI resolves to upstream.
function fetchFromProvider(provider: GitReviewProvider, cwd: string, repoRef: string | null, deps: GitReviewCacheDeps): GitReviewData | null {
    const fetchFn = provider === 'gh' ? fetchFromGh : fetchFromGlab;

    try {
        const unpinned = fetchFn(cwd, null, deps);
        if (unpinned) {
            return unpinned;
        }
    } catch { /* fall through */ }

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
        } catch { /* try next provider */ }
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
