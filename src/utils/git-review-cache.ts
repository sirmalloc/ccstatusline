import type { ExecFileOptionsWithStringEncoding } from 'child_process';
import {
    execFile,
    execFileSync,
    spawn
} from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    statSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'util';

// Promise-based execFile with string decoding (see usage-fetch.ts for the shape).
const execFileAsync = promisify(execFile) as (
    file: string,
    args: readonly string[],
    options: ExecFileOptionsWithStringEncoding
) => Promise<{ stdout: string; stderr: string }>;

import {
    getVisibleWidth,
    truncateStyledText
} from './ansi';
import { resolveExecutable } from './executable-path';
import {
    GIT_HARDENING_ARGS,
    withGitHardeningEnv
} from './git-hardening';
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

export interface GitReviewFetchOptions {
    includeChecks?: boolean;
    /** Request env snapshot for the async daemon path (#18 review): proxy vars etc. */
    env?: NodeJS.ProcessEnv;
}

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
        return deps.execFileSync(resolveExecutable('git'), [...GIT_HARDENING_ARGS, ...args], {
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
        // After `--`, a host named like an option (`-oProxyCommand=…`) stays a host
        const output = deps.execFileSync(resolveExecutable('ssh'), ['-G', '--', host], {
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
        deps.execFileSync(resolveExecutable(cli), ['--version'], {
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
        deps.execFileSync(resolveExecutable(cli), ['auth', 'status', '--hostname', host], {
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

// `branch` goes after `--`: a branch named like a flag (a planted HEAD can name
// one `--web`) must stay an argument
function queryGhPr(
    cwd: string,
    args: string[],
    branch: string | null,
    fields: string,
    deadline: number,
    deps: GitReviewCacheDeps
): Record<string, unknown> | null {
    const output = deps.execFileSync(
        resolveExecutable('gh'),
        [...args, '--json', fields, ...(branch ? ['--', branch] : [])],
        {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd,
            // gh runs git in the repository too
            env: withGitHardeningEnv(process.env),
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
    let branch: string | null = null;
    if (repoRef) {
        // `--repo` disables branch auto-resolution, so pass the branch explicitly.
        branch = getCurrentBranch(cwd, deps);
        if (!branch) {
            return null;
        }
        args.push('--repo', repoRef);
    }

    let parsed: Record<string, unknown> | null;
    if (includeChecks) {
        try {
            parsed = queryGhPr(cwd, args, branch, GH_PR_WITH_CHECKS_FIELDS, deadline, deps);
        } catch (error) {
            if (!isCiFieldUnavailableError(error)) {
                throw error;
            }
            parsed = queryGhPr(cwd, args, branch, GH_PR_METADATA_FIELDS, deadline, deps);
        }
    } else {
        parsed = queryGhPr(cwd, args, branch, GH_PR_METADATA_FIELDS, deadline, deps);
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
    const args = ['mr', 'view', '--output', 'json'];
    if (repoRef) {
        // `--repo` disables branch auto-resolution, so pass the branch explicitly,
        // after `--` so a branch named like a flag stays an argument.
        const branch = getCurrentBranch(cwd, deps);
        if (!branch) {
            return null;
        }
        args.push('--repo', repoRef, '--', branch);
    }

    const output = deps.execFileSync(
        resolveExecutable('glab'),
        args,
        {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd,
            // glab runs git in the repository too
            env: withGitHardeningEnv(process.env),
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

// --- Async refresh path (#18) ---------------------------------------------------
//
// The daemon prefetch refreshes the review cache directly (non-blocking child
// processes, cancellable), so the sync formatter reads a fresh cache file and
// the detached `node <script> --internal-refresh-...` self-spawn never fires
// on the daemon path. Mirrors the sync fetch flow above; pure helpers
// (parsing, classification, remote mapping) are shared.

function runGitForCacheAsync(args: string[], cwd: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string> {
    const options: ExecFileOptionsWithStringEncoding = {
        encoding: 'utf8',
        cwd,
        timeout: CLI_TIMEOUT,
        killSignal: 'SIGKILL',
        windowsHide: true,
        ...(env !== undefined ? { env } : {}),
        ...(signal !== undefined ? { signal } : {})
    };
    return execFileAsync('git', args, options)
        .then(({ stdout }) => stdout.trim())
        .catch(() => '');
}

async function getCacheRefAsync(cwd: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string> {
    const branch = await runGitForCacheAsync(['symbolic-ref', '--short', 'HEAD'], cwd, signal, env);
    if (branch.length > 0) {
        return `branch:${branch}`;
    }

    const head = await runGitForCacheAsync(['rev-parse', '--short', 'HEAD'], cwd, signal, env);
    return head.length > 0 ? `head:${head}` : 'unknown';
}

class AsyncGitReviewDeadlineError extends Error {}

function remainingTimeoutMs(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new AsyncGitReviewDeadlineError('Git review lookup deadline exceeded');
    }
    return Math.max(1, Math.min(CLI_TIMEOUT, remaining));
}

function execFileTimeout(
    command: string,
    args: string[],
    timeoutMs: number,
    options: { signal?: AbortSignal; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
    const execOptions: ExecFileOptionsWithStringEncoding = {
        encoding: 'utf8',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        windowsHide: true,
        ...(options.env !== undefined ? { env: options.env } : {}),
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {})
    };
    return execFileAsync(command, args, execOptions).then(({ stdout }) => stdout);
}

async function isCliAvailableAsync(cli: GitReviewProvider, deadline: number, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<boolean> {
    try {
        await execFileTimeout(cli, ['--version'], remainingTimeoutMs(deadline), { signal, env });
        return true;
    } catch {
        return false;
    }
}

async function isCliAuthedForHostAsync(cli: GitReviewProvider, host: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<boolean> {
    try {
        await execFileTimeout(cli, ['auth', 'status', '--hostname', host], CLI_TIMEOUT, { signal, env });
        return true;
    } catch {
        return false;
    }
}

async function resolveSshHostAliasAsync(host: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string> {
    try {
        const output = await execFileTimeout('ssh', ['-G', host], CLI_TIMEOUT, { signal, env });
        for (const line of output.trim().split(/\r?\n/)) {
            const match = /^hostname\s+(.+)$/i.exec(line.trim());
            if (match?.[1]) {
                return match[1].toLowerCase();
            }
        }
    } catch {
        // Leave the parsed remote host unchanged when ssh is unavailable.
    }
    return host.toLowerCase();
}

async function getEffectiveRemoteHostAsync(url: string, host: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string> {
    const normalizedHost = host.toLowerCase();
    if (!isSshRemoteUrl(url) || getNamedForgeProvider(normalizedHost)) {
        return normalizedHost;
    }
    return resolveSshHostAliasAsync(normalizedHost, signal, env);
}

async function queryGhPrAsync(
    cwd: string,
    args: string[],
    fields: string,
    deadline: number,
    signal?: AbortSignal,
    env?: NodeJS.ProcessEnv
): Promise<Record<string, unknown> | null> {
    const output = (await execFileTimeout(
        'gh',
        [...args, '--json', fields],
        remainingTimeoutMs(deadline),
        { cwd, signal, env }
    )).trim();

    if (output.length === 0) {
        return null;
    }

    return JSON.parse(output) as Record<string, unknown>;
}

async function fetchFromGhAsync(
    cwd: string,
    repoRef: string | null,
    includeChecks: boolean,
    deadline: number,
    signal?: AbortSignal,
    env?: NodeJS.ProcessEnv
): Promise<GitReviewData | null> {
    const args = ['pr', 'view'];
    if (repoRef) {
        const branch = await runGitForCacheAsync(['symbolic-ref', '--short', 'HEAD'], cwd, signal, env);
        if (!branch) {
            return null;
        }
        args.push(branch, '--repo', repoRef);
    }

    let parsed: Record<string, unknown> | null;
    if (includeChecks) {
        try {
            parsed = await queryGhPrAsync(cwd, args, GH_PR_WITH_CHECKS_FIELDS, deadline, signal, env);
        } catch (error) {
            if (!isCiFieldUnavailableError(error)) {
                throw error;
            }
            parsed = await queryGhPrAsync(cwd, args, GH_PR_METADATA_FIELDS, deadline, signal, env);
        }
    } else {
        parsed = await queryGhPrAsync(cwd, args, GH_PR_METADATA_FIELDS, deadline, signal, env);
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

async function fetchFromGlabAsync(
    cwd: string,
    repoRef: string | null,
    deadline: number,
    signal?: AbortSignal,
    env?: NodeJS.ProcessEnv
): Promise<GitReviewData | null> {
    const args = ['mr', 'view'];
    if (repoRef) {
        const branch = await runGitForCacheAsync(['symbolic-ref', '--short', 'HEAD'], cwd, signal, env);
        if (!branch) {
            return null;
        }
        args.push(branch, '--repo', repoRef);
    }
    args.push('--output', 'json');

    const output = (await execFileTimeout('glab', args, remainingTimeoutMs(deadline), { cwd, signal, env })).trim();
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

async function fetchFromProviderAsync(
    provider: GitReviewProvider,
    cwd: string,
    repoRef: string | null,
    includeChecks: boolean,
    deadline: number,
    signal?: AbortSignal,
    env?: NodeJS.ProcessEnv
): Promise<GitReviewData | null> {
    const fetch = (targetRepoRef: string | null): Promise<GitReviewData | null> => provider === 'gh'
        ? fetchFromGhAsync(cwd, targetRepoRef, includeChecks, deadline, signal, env)
        : fetchFromGlabAsync(cwd, targetRepoRef, deadline, signal, env);

    try {
        const unpinned = await fetch(null);
        if (unpinned) {
            return unpinned;
        }
    } catch { /* fall through */ }

    if (repoRef) {
        return fetch(repoRef);
    }
    return null;
}

async function getProviderCandidatesAsync(cwd: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<GitReviewProvider[]> {
    const url = await runGitForCacheAsync(['remote', 'get-url', '--', 'origin'], cwd, signal, env);
    if (url.length === 0) {
        return ['gh', 'glab'];
    }
    const parsed = parseRemoteUrl(url);
    if (!parsed) {
        return ['gh', 'glab'];
    }
    const host = await getEffectiveRemoteHostAsync(url, parsed.host, signal, env);
    const namedForgeProvider = getNamedForgeProvider(host);
    if (namedForgeProvider) {
        return [namedForgeProvider];
    }
    const authed: GitReviewProvider[] = [];
    if (await isCliAuthedForHostAsync('glab', host, signal, env)) {
        authed.push('glab');
    }
    if (await isCliAuthedForHostAsync('gh', host, signal, env)) {
        authed.push('gh');
    }
    return authed;
}

/**
 * Async twin of fetchGitReviewData for the daemon prefetch (#18). Same cache
 * file, same TTL/stale semantics, same provider fallback order; failures keep
 * stale data exactly like the sync path. Writes the cache file the sync
 * formatter reads, so the daemon's formatting section never spawns a forge
 * CLI and never schedules the detached node self-refresh.
 */
export async function fetchGitReviewDataAsync(
    cwd: string,
    options: GitReviewFetchOptions = {},
    signal?: AbortSignal
): Promise<GitReviewData | null> {
    const includeChecks = options.includeChecks ?? false;
    const env = options.env;
    const cachePath = getCachePath(cwd, await getCacheRefAsync(cwd, signal, env), DEFAULT_GIT_REVIEW_CACHE_DEPS);
    const cached = readCache(cachePath, DEFAULT_GIT_REVIEW_CACHE_DEPS);
    if (cached !== 'miss'
        && !cached.stale
        && (!includeChecks || cached.checksQueried)) {
        return cached.data;
    }
    const repoRef = await getOriginRepoRefAsync(cwd, signal, env);
    const deadline = Date.now() + CLI_TIMEOUT;

    for (const provider of await getProviderCandidatesAsync(cwd, signal, env)) {
        if (!(await isCliAvailableAsync(provider, deadline, signal, env))) {
            continue;
        }
        try {
            const data = await fetchFromProviderAsync(provider, cwd, repoRef, includeChecks, deadline, signal, env);
            if (data) {
                writeCache(cachePath, data, includeChecks, DEFAULT_GIT_REVIEW_CACHE_DEPS);
                return data;
            }
        } catch { /* try next provider */ }
    }

    if (cached !== 'miss' && cached.data !== null) {
        return cached.data;
    }

    writeCache(cachePath, null, true, DEFAULT_GIT_REVIEW_CACHE_DEPS);
    return null;
}

async function getOriginRepoRefAsync(cwd: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string | null> {
    const url = await runGitForCacheAsync(['remote', 'get-url', '--', 'origin'], cwd, signal, env);
    if (url.length === 0) {
        return null;
    }
    const parsed = parseRemoteUrl(url);
    if (!parsed) {
        return null;
    }
    const host = await getEffectiveRemoteHostAsync(url, parsed.host, signal, env);
    return `https://${host}/${parsed.owner}/${parsed.repo}`;
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
    if (getVisibleWidth(title) <= limit)
        return title;
    // Cut by terminal columns and whole characters, so wide (CJK) characters
    // count twice and an emoji is never split in half
    return `${truncateStyledText(title, limit - 1, { ellipsis: false })}…`;
}
