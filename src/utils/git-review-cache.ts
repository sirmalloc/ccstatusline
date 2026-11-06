import {
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

import type { RenderContext } from '../types/RenderContext';

import {
    getVisibleWidth,
    truncateStyledText
} from './ansi';
import { resolveExecutable } from './executable-path';
import { runGit } from './git';
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

export interface GitReviewFetchOptions { includeChecks?: boolean }

export interface GitReviewCachedOptions extends GitReviewFetchOptions {
    // The widget's render context. When given, the branch/HEAD lookup that
    // keys the cache goes through git.ts's cached runGit (shared with the
    // git-branch and git-sha widgets) instead of spawning git every render.
    context?: RenderContext;
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

function summarizeCiChecks(kinds: CiCheckKind[]): GitCiChecks | null {
    if (kinds.length === 0)
        return null;

    let failing = 0;
    let pending = 0;
    let success = 0;
    for (const kind of kinds) {
        if (kind === 'failed')
            failing++;
        else if (kind === 'pending')
            pending++;
        else if (kind === 'success')
            success++;
    }

    const state: GitCiState = failing > 0 ? 'failing' : pending > 0 ? 'pending' : 'passing';
    return { state, failing, pending, success };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function computeCiRollup(rollup: unknown): GitCiChecks | null {
    if (!Array.isArray(rollup))
        return null;
    return summarizeCiChecks(rollup.filter(isRecord).map(classifyCheck));
}

// The statuses of a check run that hasn't completed, and a status context's
// pending states
const PENDING_CHECK_STATES = new Set(['REQUESTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'EXPECTED']);

// Classify a `gh pr checks` row as classifyCheck does the rollup entry it came
// from. Its state is a check run's conclusion once the run has completed and
// its status before that, or a status context's state. (gh's own `bucket`
// files STARTUP_FAILURE and STALE under pending.)
function classifyCheckRowState(state: string): CiCheckKind {
    if (state === 'SUCCESS')
        return 'success';
    if (state === 'NEUTRAL' || state === 'SKIPPED')
        return 'ignored';
    if (PENDING_CHECK_STATES.has(state))
        return 'pending';
    return 'failed';
}

// `gh pr checks --json state` prints one row per check
function computeCiChecksFromRows(rows: unknown): GitCiChecks | null {
    if (!Array.isArray(rows))
        return null;
    const states = rows.map(row => (isRecord(row) ? row.state : undefined));
    if (!states.every((state): state is string => typeof state === 'string'))
        return null;
    return summarizeCiChecks(states.map(state => classifyCheckRowState(state.toUpperCase())));
}

// Two rollup entries are runs of the same check when they share a status
// context, or a check run's name and workflow. Entries with neither can't be
// told apart, so they never count as repeats.
function getRollupCheckKey(entry: unknown): string | null {
    if (!isRecord(entry))
        return null;
    const { context, name, workflowName } = entry;
    if (typeof context === 'string' && context.length > 0)
        return JSON.stringify(['context', context]);
    if (typeof name === 'string' && name.length > 0)
        return JSON.stringify(['check', name, typeof workflowName === 'string' ? workflowName : '']);
    return null;
}

function hasRepeatedCheck(rollup: unknown): boolean {
    if (!Array.isArray(rollup))
        return false;
    const keys = rollup.map(getRollupCheckKey).filter(key => key !== null);
    return new Set(keys).size < keys.length;
}

const GIT_REVIEW_CACHE_TTL = 30_000;
const CLI_TIMEOUT = 5_000;
const REFRESH_LOCK_STALE_MS = 30_000;
const DEFAULT_TITLE_MAX_WIDTH = 30;
const GH_PR_METADATA_FIELDS = 'url,number,title,state,reviewDecision';
const GH_PR_WITH_CHECKS_FIELDS = `${GH_PR_METADATA_FIELDS},statusCheckRollup`;
const GH_PR_CHECKS_FIELDS = 'state';
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
    runGit?: typeof runGit;
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
    now: Date.now,
    runGit
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

const BRANCH_REF_PREFIX = 'refs/heads/';

// Read from the full ref, since --short turns it into "heads/<name>" when a
// tag has the same name, and no PR is on a branch by that name
function toBranchName(ref: string): string | null {
    const branch = ref.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : ref;
    return branch.length > 0 ? branch : null;
}

function getCurrentBranch(cwd: string, deps: GitReviewCacheDeps): string | null {
    return toBranchName(runGitForCache(['symbolic-ref', 'HEAD'], cwd, deps));
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

// Same ref as getCacheRef (which the refresh child still uses to derive the
// lock path it may release), read through the render's cached git commands.
function getCacheRefFromContext(context: RenderContext, cwd: string, deps: GitReviewCacheDeps): string {
    if (!deps.runGit) {
        return getCacheRef(cwd, deps);
    }

    const branch = toBranchName(deps.runGit('symbolic-ref HEAD', context)?.trim() ?? '');
    if (branch) {
        return `branch:${branch}`;
    }

    const head = deps.runGit('rev-parse --short HEAD', context)?.trim() ?? '';
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

// The forges' own hosts. SSH config can route them through a transport
// endpoint such as ssh.github.com, which serves no repositories over HTTPS.
const CANONICAL_FORGE_HOSTS = new Set(['github.com', 'gitlab.com']);
const FORGE_TRANSPORT_HOSTS = new Map([
    ['ssh.github.com', 'github.com'],
    ['altssh.gitlab.com', 'gitlab.com']
]);

function getEffectiveRemoteHost(url: string, host: string, deps: GitReviewCacheDeps): string {
    const normalizedHost = host.toLowerCase();
    if (!isSshRemoteUrl(url) || CANONICAL_FORGE_HOSTS.has(normalizedHost)) {
        return normalizedHost;
    }

    const resolvedHost = resolveSshHostAlias(normalizedHost, deps);
    const hostProvider = getNamedForgeProvider(normalizedHost);
    if (!hostProvider) {
        return resolvedHost;
    }

    const canonicalHost = FORGE_TRANSPORT_HOSTS.get(resolvedHost) ?? resolvedHost;
    if (CANONICAL_FORGE_HOSTS.has(canonicalHost)) {
        return canonicalHost;
    }
    // Left as it is, or sent to an IP or to a host naming no forge, the host
    // keeps its own name
    const resolvedProvider = getNamedForgeProvider(resolvedHost);
    if (resolvedHost === normalizedHost || !resolvedProvider) {
        return normalizedHost;
    }

    // Both names name a forge. The host is an alias (github-work,
    // github.com-work, gitlab-corp), or the forge's own hostname
    // (gitlab.corp.example, or a short name such as gitlab reached through a
    // DNS search domain) that SSH config sends to an SSH-only endpoint
    // (gitlab-ssh.corp.example). Keep whichever name the forge's CLI is logged
    // in to, which is the one serving the repo over HTTPS, trying the host's
    // own name first. Logged in to neither, a host without a dot reads as an
    // alias.
    if (isCliAuthedForHost(hostProvider, normalizedHost, deps)) {
        return normalizedHost;
    }
    if (isCliAuthedForHost(resolvedProvider, resolvedHost, deps)) {
        return resolvedHost;
    }
    return normalizedHost.includes('.') ? normalizedHost : resolvedHost;
}

interface OriginRemote {
    // The host the forge's CLI knows origin by
    host: string;
    // origin's repo on that host, for `--repo`
    repoRef: string;
}

// Worked out once per lookup: it can run `ssh -G` and `auth status` probes
function getOriginRemote(cwd: string, deps: GitReviewCacheDeps): OriginRemote | null {
    const url = getOriginUrl(cwd, deps);
    if (!url) {
        return null;
    }
    const parsed = parseRemoteUrl(url);
    if (!parsed) {
        return null;
    }
    const host = getEffectiveRemoteHost(url, parsed.host, deps);
    return { host, repoRef: `https://${host}/${parsed.owner}/${parsed.repo}` };
}

// Self-hosted hosts that name neither forge are resolved by probing each CLI's
// `auth status --hostname <host>` and keeping those that are authed.
function getProviderCandidates(host: string | null, deps: GitReviewCacheDeps): GitReviewProvider[] {
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

function runGh(cwd: string, args: string[], deadline: number, deps: GitReviewCacheDeps): string {
    return deps.execFileSync(resolveExecutable('gh'), args, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        // gh runs git in the repository too
        env: withGitHardeningEnv(process.env),
        timeout: getRemainingTimeout(deadline, deps),
        windowsHide: true
    }).trim();
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
    const output = runGh(cwd, [...args, '--json', fields, ...(branch ? ['--', branch] : [])], deadline, deps);

    if (output.length === 0) {
        return null;
    }

    return JSON.parse(output) as Record<string, unknown>;
}

// gh pr view's statusCheckRollup lists every run of a check on the PR's head
// commit, so counted as it is, a check that failed and then passed on a re-run
// shows as failing. `gh pr checks` (which has --json since gh 2.50) keeps only
// the newest run of each check, keyed on its name, workflow and the event that
// started it. The rollup has no event, so its entries alone can't tell a
// re-run from a workflow's push and pull_request runs, which GitHub lists as
// two checks. So when the rollup repeats a check, the counts come from
// `gh pr checks`, within the lookup's budget. If that call fails or prints no
// rows, the rollup's own counts stay: they can overstate failures, but never
// miss one.
function getGhCiChecks(
    cwd: string,
    repoRef: string | null,
    prNumber: number,
    rollup: unknown,
    deadline: number,
    deps: GitReviewCacheDeps
): GitCiChecks | undefined {
    const rollupChecks = computeCiRollup(rollup);
    if (!rollupChecks || !hasRepeatedCheck(rollup)) {
        return rollupChecks ?? undefined;
    }

    try {
        const output = runGh(cwd, [
            'pr',
            'checks',
            ...(repoRef ? ['--repo', repoRef] : []),
            '--json',
            GH_PR_CHECKS_FIELDS,
            '--',
            String(prNumber)
        ], deadline, deps);
        return computeCiChecksFromRows(JSON.parse(output)) ?? rollupChecks;
    } catch {
        return rollupChecks;
    }
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
        checks: getGhCiChecks(cwd, repoRef, parsed.number, parsed.statusCheckRollup, deadline, deps)
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
    // The auth probes that pick origin's host or its CLI each have their own
    // timeout, so the lookup's budget starts after them
    const origin = getOriginRemote(cwd, deps);
    const repoRef = origin?.repoRef ?? null;
    const providers = getProviderCandidates(origin?.host ?? null, deps);
    const deadline = deps.now() + CLI_TIMEOUT;

    for (const provider of providers) {
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
    options: GitReviewCachedOptions = {},
    deps: GitReviewCacheDeps = DEFAULT_GIT_REVIEW_CACHE_DEPS
): GitReviewData | null {
    const includeChecks = options.includeChecks ?? false;
    const ref = options.context
        ? getCacheRefFromContext(options.context, cwd, deps)
        : getCacheRef(cwd, deps);
    const cachePath = getCachePath(cwd, ref, deps);
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
    if (getVisibleWidth(title) <= limit)
        return title;
    // Cut by terminal columns and whole characters, so wide (CJK) characters
    // count twice and an emoji is never split in half
    return `${truncateStyledText(title, limit - 1, { ellipsis: false })}…`;
}
