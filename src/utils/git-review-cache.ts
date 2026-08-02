import {
    execFileSync,
    spawn
} from 'child_process';
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    statSync,
    unlinkSync,
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

export interface GitReviewFetchOptions { includeChecks?: boolean }

interface StoredGitReviewCache {
    version: 1;
    data: GitReviewData | null;
    checksQueried: boolean;
}

interface CachedGitReviewData {
    data: GitReviewData | null;
    checksQueried: boolean;
    stale: boolean;
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
const REFRESH_LOCK_STALE_MS = 30_000;
const DEFAULT_TITLE_MAX_WIDTH = 30;
const GH_PR_METADATA_FIELDS = 'url,number,title,state,reviewDecision';
const GH_PR_WITH_CHECKS_FIELDS = `${GH_PR_METADATA_FIELDS},statusCheckRollup`;
export const GIT_REVIEW_REFRESH_FLAG = '--internal-refresh-git-review-cache';

export interface GitReviewCacheDeps {
    closeSync: typeof closeSync;
    execFileSync: typeof execFileSync;
    existsSync: typeof existsSync;
    getExecPath: () => string;
    mkdirSync: typeof mkdirSync;
    openSync: typeof openSync;
    readFileSync: typeof readFileSync;
    getScriptPath: () => string | undefined;
    spawn: typeof spawn;
    statSync: typeof statSync;
    unlinkSync: typeof unlinkSync;
    writeFileSync: typeof writeFileSync;
    getHomedir: typeof os.homedir;
    now: typeof Date.now;
}

const DEFAULT_GIT_REVIEW_CACHE_DEPS: GitReviewCacheDeps = {
    closeSync,
    execFileSync,
    existsSync,
    getExecPath: () => process.execPath,
    mkdirSync,
    openSync,
    readFileSync,
    getScriptPath: () => process.argv[1],
    spawn,
    statSync,
    unlinkSync,
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

function isGitReviewData(value: unknown): value is GitReviewData {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Partial<GitReviewData>;
    return typeof candidate.number === 'number' && typeof candidate.url === 'string';
}

function decodeCache(content: string): Omit<CachedGitReviewData, 'stale'> | 'miss' {
    if (content.length === 0) {
        // v2.2.24 and earlier represented a cached "no PR" result as an
        // empty file. A missing PR also implies that no CI checks can exist.
        return { data: null, checksQueried: true };
    }

    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
        const stored = parsed as Partial<StoredGitReviewCache>;
        if (stored.version === 1
            && typeof stored.checksQueried === 'boolean'
            && (stored.data === null || isGitReviewData(stored.data))) {
            return {
                data: stored.data,
                checksQueried: stored.data === null || stored.checksQueried
            };
        }
    }

    if (isGitReviewData(parsed)) {
        // Legacy cache files stored GitReviewData directly. The presence of
        // checks proves the old lookup included CI data; absence is treated
        // as metadata-only because an empty rollup was previously omitted.
        return {
            data: parsed,
            checksQueried: parsed.checks !== undefined
        };
    }

    return 'miss';
}

function readCache(cachePath: string, deps: GitReviewCacheDeps): CachedGitReviewData | 'miss' {
    try {
        if (!deps.existsSync(cachePath)) {
            return 'miss';
        }
        const age = deps.now() - deps.statSync(cachePath).mtimeMs;
        const content = deps.readFileSync(cachePath, 'utf-8').trim();
        const decoded = decodeCache(content);
        if (decoded === 'miss') {
            return 'miss';
        }
        return {
            ...decoded,
            stale: age > GIT_REVIEW_CACHE_TTL
        };
    } catch {
        return 'miss';
    }
}

function writeCache(
    cachePath: string,
    data: GitReviewData | null,
    checksQueried: boolean,
    deps: GitReviewCacheDeps
): void {
    try {
        const cacheDir = getGitReviewCacheDir(deps);
        if (!deps.existsSync(cacheDir)) {
            deps.mkdirSync(cacheDir, { recursive: true });
        }
        const stored: StoredGitReviewCache = {
            version: 1,
            data,
            checksQueried: data === null || checksQueried
        };
        deps.writeFileSync(cachePath, JSON.stringify(stored), 'utf-8');
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

class GitReviewDeadlineError extends Error {}

function getRemainingTimeout(deadline: number, deps: GitReviewCacheDeps): number {
    const remaining = deadline - deps.now();
    if (remaining <= 0) {
        throw new GitReviewDeadlineError('Git review lookup deadline exceeded');
    }
    return Math.max(1, Math.min(CLI_TIMEOUT, remaining));
}

function isCliAvailable(cli: GitReviewProvider, deadline: number, deps: GitReviewCacheDeps): boolean {
    try {
        deps.execFileSync(cli, ['--version'], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: getRemainingTimeout(deadline, deps),
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

function errorText(error: unknown): string {
    if (!(error instanceof Error)) {
        return '';
    }

    const stderr = 'stderr' in error
        ? (error as Error & { stderr?: Buffer | string }).stderr
        : undefined;
    const stderrText = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : (stderr ?? '');
    return `${error.message}\n${stderrText}`.toLowerCase();
}

function isCiFieldUnavailableError(error: unknown): boolean {
    const text = errorText(error);
    return text.includes('statuscheckrollup')
        || text.includes('resource not accessible by integration');
}

function queryGhPr(
    cwd: string,
    args: string[],
    fields: string,
    deadline: number,
    deps: GitReviewCacheDeps
): Record<string, unknown> | null {
    const output = deps.execFileSync(
        'gh',
        [...args, '--json', fields],
        {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd,
            timeout: getRemainingTimeout(deadline, deps),
            windowsHide: true
        }
    ).trim();

    if (output.length === 0) {
        return null;
    }

    return JSON.parse(output) as Record<string, unknown>;
}

function fetchFromGh(
    cwd: string,
    repoRef: string | null,
    includeChecks: boolean,
    deadline: number,
    deps: GitReviewCacheDeps
): GitReviewData | null {
    const args = ['pr', 'view'];
    if (repoRef) {
        // `--repo` disables branch auto-resolution, so pass the branch explicitly.
        const branch = getCurrentBranch(cwd, deps);
        if (!branch) {
            return null;
        }
        args.push(branch, '--repo', repoRef);
    }

    let parsed: Record<string, unknown> | null;
    if (includeChecks) {
        try {
            parsed = queryGhPr(cwd, args, GH_PR_WITH_CHECKS_FIELDS, deadline, deps);
        } catch (error) {
            if (!isCiFieldUnavailableError(error)) {
                throw error;
            }
            parsed = queryGhPr(cwd, args, GH_PR_METADATA_FIELDS, deadline, deps);
        }
    } else {
        parsed = queryGhPr(cwd, args, GH_PR_METADATA_FIELDS, deadline, deps);
    }

    if (!parsed) {
        return null;
    }
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

function fetchFromGlab(
    cwd: string,
    repoRef: string | null,
    deadline: number,
    deps: GitReviewCacheDeps
): GitReviewData | null {
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
            timeout: getRemainingTimeout(deadline, deps),
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
function fetchFromProvider(
    provider: GitReviewProvider,
    cwd: string,
    repoRef: string | null,
    includeChecks: boolean,
    deadline: number,
    deps: GitReviewCacheDeps
): GitReviewData | null {
    const fetch = (targetRepoRef: string | null): GitReviewData | null => provider === 'gh'
        ? fetchFromGh(cwd, targetRepoRef, includeChecks, deadline, deps)
        : fetchFromGlab(cwd, targetRepoRef, deadline, deps);

    try {
        const unpinned = fetch(null);
        if (unpinned) {
            return unpinned;
        }
    } catch { /* fall through */ }

    if (repoRef) {
        return fetch(repoRef);
    }
    return null;
}

export function fetchGitReviewData(
    cwd: string,
    deps: GitReviewCacheDeps = DEFAULT_GIT_REVIEW_CACHE_DEPS,
    options: GitReviewFetchOptions = {}
): GitReviewData | null {
    const includeChecks = options.includeChecks ?? false;
    const cachePath = getCachePath(cwd, getCacheRef(cwd, deps), deps);
    const cached = readCache(cachePath, deps);
    if (cached !== 'miss'
        && !cached.stale
        && (!includeChecks || cached.checksQueried)) {
        return cached.data;
    }
    const repoRef = getOriginRepoRef(cwd, deps);
    const deadline = deps.now() + CLI_TIMEOUT;

    for (const provider of getProviderCandidates(cwd, deps)) {
        if (!isCliAvailable(provider, deadline, deps)) {
            continue;
        }
        try {
            const data = fetchFromProvider(provider, cwd, repoRef, includeChecks, deadline, deps);
            if (data) {
                writeCache(cachePath, data, includeChecks, deps);
                return data;
            }
        } catch { /* try next provider */ }
    }

    // Keep useful stale data on transient refresh failures. A later statusline
    // invocation will schedule another refresh because its mtime stays stale.
    if (cached !== 'miss' && cached.data !== null) {
        return cached.data;
    }

    writeCache(cachePath, null, true, deps);
    return null;
}

function getRefreshLockPath(cachePath: string): string {
    return `${cachePath}.lock`;
}

function releaseRefreshLock(lockPath: string, deps: GitReviewCacheDeps): void {
    try {
        deps.unlinkSync(lockPath);
    } catch {
        // Another process may already have cleaned up a stale lock.
    }
}

function createRefreshLock(cachePath: string, deps: GitReviewCacheDeps): string | null {
    const cacheDir = getGitReviewCacheDir(deps);
    try {
        if (!deps.existsSync(cacheDir)) {
            deps.mkdirSync(cacheDir, { recursive: true });
        }
    } catch {
        return null;
    }

    const lockPath = getRefreshLockPath(cachePath);
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const descriptor = deps.openSync(lockPath, 'wx');
            deps.closeSync(descriptor);
            return lockPath;
        } catch {
            try {
                const age = deps.now() - deps.statSync(lockPath).mtimeMs;
                if (age <= REFRESH_LOCK_STALE_MS) {
                    return null;
                }
                deps.unlinkSync(lockPath);
            } catch {
                return null;
            }
        }
    }
    return null;
}

function scheduleRefresh(
    cwd: string,
    cachePath: string,
    includeChecks: boolean,
    deps: GitReviewCacheDeps
): void {
    const scriptPath = deps.getScriptPath();
    if (!scriptPath) {
        return;
    }

    const lockPath = createRefreshLock(cachePath, deps);
    if (!lockPath) {
        return;
    }

    try {
        const child = deps.spawn(
            deps.getExecPath(),
            [
                scriptPath,
                GIT_REVIEW_REFRESH_FLAG,
                cwd,
                includeChecks ? 'checks' : 'metadata',
                lockPath
            ],
            {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            }
        );
        child.unref();
    } catch {
        releaseRefreshLock(lockPath, deps);
    }
}

export function getCachedGitReviewData(
    cwd: string,
    options: GitReviewFetchOptions = {},
    deps: GitReviewCacheDeps = DEFAULT_GIT_REVIEW_CACHE_DEPS
): GitReviewData | null {
    const includeChecks = options.includeChecks ?? false;
    const cachePath = getCachePath(cwd, getCacheRef(cwd, deps), deps);
    const cached = readCache(cachePath, deps);
    const needsRefresh = cached === 'miss'
        || cached.stale
        || (includeChecks && !cached.checksQueried);

    if (needsRefresh) {
        scheduleRefresh(cwd, cachePath, includeChecks, deps);
    }

    return cached === 'miss' ? null : cached.data;
}

export function refreshGitReviewCacheFromCli(
    cwd: string,
    options: GitReviewFetchOptions,
    lockPath: string,
    deps: GitReviewCacheDeps = DEFAULT_GIT_REVIEW_CACHE_DEPS
): void {
    const expectedLockPath = getRefreshLockPath(
        getCachePath(cwd, getCacheRef(cwd, deps), deps)
    );
    try {
        fetchGitReviewData(cwd, deps, options);
    } finally {
        // Only unlink the path derived from the supplied repository. This
        // keeps the internal CLI mode from becoming an arbitrary file delete.
        if (lockPath === expectedLockPath) {
            releaseRefreshLock(lockPath, deps);
        }
    }
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
