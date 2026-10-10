import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { RenderContext } from '../types/RenderContext';

import { resolveExecutable } from './executable-path';
import {
    GIT_HARDENING_ARGS,
    getFilterOverrideArgs,
    parseFilterConfig,
    type FilterConfigEntry
} from './git-hardening';

export interface GitChangeCounts {
    insertions: number;
    deletions: number;
}

export interface GitFileStatusCounts {
    staged: number;
    unstaged: number;
    untracked: number;
}

interface GitRepoMetadata {
    cachePath: string;
    headMtimeMs: number | null;
    indexMtimeMs: number | null;
}

interface GitCacheEntry {
    output: string | null;
    createdAt: number;
    headMtimeMs: number | null;
    indexMtimeMs: number | null;
}

interface PersistentGitCache {
    version: 1;
    cwd: string | null;
    entries: Record<string, GitCacheEntry>;
}

const DEFAULT_GIT_CACHE_TTL_SECONDS = 5;
const GIT_CACHE_SCHEMA_VERSION = 1 as const;

// Matches the timeout used by every other external CLI call site: a git
// invocation that blocks (slow network filesystem, hung credential helper)
// must not freeze the statusline process - the error path below caches null
// and the widget renders empty instead.
const GIT_COMMAND_TIMEOUT_MS = 5_000;

// In-process cache keeps cwd in the key; the persistent cache uses one file
// per (repo, cwd) pair, stores cwd once at the file level and keys entries by
// command. Per-cwd files matter because some outputs are cwd-scoped (e.g.
// `ls-files --unmerged`) and because sessions in the same repo at different
// cwds (root vs a subdirectory) would otherwise evict each other every render.
const gitCommandCache = new Map<string, GitCacheEntry>();
const filterOverrideCache = new Map<string, string[] | null>();

// Commands that re-read work tree files, and so can run filter drivers, with the
// options that keep them from running external diff tools or recursing into
// submodules, whose own config isn't checked
const WORK_TREE_COMMAND_ARGS = new Map<string, string[]>([
    ['status', ['--ignore-submodules=dirty']],
    ['diff', ['--no-ext-diff', '--no-textconv', '--ignore-submodules=dirty']]
]);

// `git config --get-regexp` exits with 1 when nothing matches
const GIT_CONFIG_NO_MATCH_STATUS = 1;

function getCacheDir(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline');
}

function getCachePath(gitDir: string, cwd: string): string {
    const repoHash = createHash('sha256')
        .update(`${gitDir}\0${cwd}`)
        .digest('hex')
        .slice(0, 16);

    return path.join(getCacheDir(), 'git-cache', `git-${repoHash}.json`);
}

function getMtimeMs(filePath: string): number | null {
    try {
        return fs.statSync(filePath).mtimeMs;
    } catch {
        return null;
    }
}

function normalizeDirectory(candidate: string): string | null {
    try {
        const resolved = path.resolve(candidate);
        const stats = fs.statSync(resolved);
        return stats.isDirectory()
            ? resolved
            : path.dirname(resolved);
    } catch {
        return null;
    }
}

function readGitDirFile(gitFilePath: string): string | null {
    try {
        const content = fs.readFileSync(gitFilePath, 'utf-8').trim();
        // The path starts at a non-space. With `.+`, a long run of whitespace
        // could be split between `\s*` and the path at every position, each
        // split rescanning the rest of the line.
        const match = /^gitdir:\s*(\S.*)$/i.exec(content);
        if (!match?.[1]) {
            return null;
        }

        return path.resolve(path.dirname(gitFilePath), match[1]);
    } catch {
        return null;
    }
}

function discoverGitDir(startDir: string): string | null {
    let current = startDir;

    for (;;) {
        const gitPath = path.join(current, '.git');

        try {
            const stats = fs.statSync(gitPath);
            if (stats.isDirectory()) {
                return gitPath;
            }
            if (stats.isFile()) {
                return readGitDirFile(gitPath);
            }
        } catch {
            // Keep walking up.
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

// The directory holding the .git entry that git would find from startDir
function findWorkTreeRoot(startDir: string): string | null {
    let current = startDir;

    for (;;) {
        if (fs.existsSync(path.join(current, '.git'))) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

function readTextFile(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

// Whether the repository's own config files could define a filter driver,
// directly or through an include. Reading them is far cheaper than asking git,
// and most repositories have none.
function mayDefineFilters(gitDir: string): boolean {
    const commonDir = readTextFile(path.join(gitDir, 'commondir')).trim();
    const configDirs = [gitDir, ...(commonDir ? [path.resolve(gitDir, commonDir)] : [])];
    const configText = configDirs
        .flatMap(dir => [path.join(dir, 'config'), path.join(dir, 'config.worktree')])
        .map(readTextFile)
        .join('\n');

    return /filter|include/i.test(configText);
}

function gitExecOptions(cwd: string | undefined) {
    // --no-optional-locks (or GIT_OPTIONAL_LOCKS=0) prevents read-only commands
    // (diff, status, rev-list, ...) from racing on .git/index.lock when another
    // git process is writing it.
    // We use the environment variable instead of the CLI flag because older Git
    // versions (like 2.10.1) fail with "Unknown option: --no-optional-locks".
    // See https://git-scm.com/docs/git#Documentation/git.txt---no-optional-locks
    return {
        encoding: 'utf8' as const,
        stdio: ['pipe', 'pipe', 'ignore'] as ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        timeout: GIT_COMMAND_TIMEOUT_MS,
        windowsHide: true,
        ...(cwd ? { cwd } : {})
    };
}

// '' when nothing matches; null when git couldn't read the config
function readFilterConfig(args: string[], cwd: string | undefined): string | null {
    try {
        return execFileSync(resolveExecutable('git'), [...GIT_HARDENING_ARGS, 'config', ...args, '-z', '--get-regexp', '^filter\\.'], gitExecOptions(cwd));
    } catch (error) {
        return (error as { status?: unknown }).status === GIT_CONFIG_NO_MATCH_STATUS ? '' : null;
    }
}

function readRepositoryFilterConfig(cwd: string | undefined): FilterConfigEntry[] | null {
    const scoped = readFilterConfig(['--includes', '--show-scope'], cwd);
    if (scoped !== null) {
        return parseFilterConfig(scoped, true);
    }

    // git before 2.26 has no --show-scope: read the repository's own files
    // instead. --worktree is newer still; without it, --local covers them.
    const local = readFilterConfig(['--local', '--includes'], cwd);
    if (local === null) {
        return null;
    }
    const worktree = readFilterConfig(['--worktree', '--includes'], cwd) ?? '';
    return [...parseFilterConfig(local, false), ...parseFilterConfig(worktree, false)];
}

// The -c arguments that turn off the repository's own filter drivers for
// commands that re-read the work tree; null when that isn't possible
function getRepositoryFilterOverrideArgs(cwd: string | undefined): string[] | null {
    const cacheKey = cwd ?? '';
    const cached = filterOverrideCache.get(cacheKey);
    if (cached !== undefined || filterOverrideCache.has(cacheKey)) {
        return cached ?? null;
    }

    // Without a .git to read, git could only be using a bare repository found by
    // searching upward, which safe.bareRepository refuses (git 2.38 and later)
    const startDir = normalizeDirectory(cwd ?? process.cwd()) ?? process.cwd();
    const gitDir = discoverGitDir(startDir);
    let overrides: string[] | null = [];
    if (gitDir && mayDefineFilters(gitDir)) {
        const entries = readRepositoryFilterConfig(cwd);
        overrides = entries === null
            ? null
            : getFilterOverrideArgs(entries, findWorkTreeRoot(startDir) ?? startDir);
    }

    filterOverrideCache.set(cacheKey, overrides);
    return overrides;
}

/**
 * Runs git as every status line call should: with fsmonitor off, no bare
 * repository found by searching upward, and, for commands that re-read work tree
 * files, none of the repository's own filter drivers or external diff tools.
 * Throws when git fails, or when the repository's filters can't be turned off.
 */
export function execGit(args: string[], cwd: string | undefined): string {
    const [subcommand = '', ...rest] = args;
    const workTreeArgs = WORK_TREE_COMMAND_ARGS.get(subcommand);
    const filterArgs = workTreeArgs ? getRepositoryFilterOverrideArgs(cwd) : [];
    if (filterArgs === null) {
        throw new Error('The repository\'s filter drivers could not be turned off');
    }

    return execFileSync(
        resolveExecutable('git'),
        [...GIT_HARDENING_ARGS, ...filterArgs, subcommand, ...(workTreeArgs ?? []), ...rest],
        gitExecOptions(cwd)
    );
}

function getGitRepoMetadata(cwd: string | undefined): GitRepoMetadata | null {
    if (!cwd) {
        return null;
    }

    const startDir = normalizeDirectory(cwd);
    if (!startDir) {
        return null;
    }

    const gitDir = discoverGitDir(startDir);
    if (!gitDir) {
        return null;
    }

    return {
        cachePath: getCachePath(gitDir, cwd),
        headMtimeMs: getMtimeMs(path.join(gitDir, 'HEAD')),
        indexMtimeMs: getMtimeMs(path.join(gitDir, 'index'))
    };
}

// True only when git is certain to fail with "not a git repository" in cwd,
// so runGitArgs can skip the spawn (every command it runs needs a repo). This
// is deliberately more conservative than discoverGitDir: it walks the
// physical path (git discovers from getcwd() after chdir), treats any `.git`
// entry (even a malformed gitfile) or any `HEAD` (bare repo, or cwd inside a
// git dir) as a possible repo, and bails out when GIT_DIR / GIT_WORK_TREE /
// GIT_COMMON_DIR could point git elsewhere. GIT_CEILING_DIRECTORIES and
// filesystem boundaries only make git stop earlier, so walking to the root
// is the safe direction.
function isDefinitelyOutsideGitRepository(cwd: string): boolean {
    if (
        process.env.GIT_DIR !== undefined
        || process.env.GIT_WORK_TREE !== undefined
        || process.env.GIT_COMMON_DIR !== undefined
    ) {
        return false;
    }

    let current: string;
    try {
        current = fs.realpathSync(cwd);
        if (!fs.statSync(current).isDirectory()) {
            return false;
        }
    } catch {
        return false;
    }

    for (;;) {
        for (const marker of ['.git', 'HEAD']) {
            try {
                fs.lstatSync(path.join(current, marker));
                return false;
            } catch {
                // Not present; keep looking.
            }
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return true;
        }
        current = parent;
    }
}

function getGitCacheTtlMs(context: RenderContext): number {
    const ttlSeconds = context.gitCacheTtlSeconds;
    if (typeof ttlSeconds !== 'number' || !Number.isFinite(ttlSeconds)) {
        return DEFAULT_GIT_CACHE_TTL_SECONDS * 1000;
    }

    return Math.min(60, Math.max(0, ttlSeconds)) * 1000;
}

function isCacheEntry(value: unknown): value is GitCacheEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return (typeof entry.output === 'string' || entry.output === null)
        && typeof entry.createdAt === 'number'
        && (typeof entry.headMtimeMs === 'number' || entry.headMtimeMs === null)
        && (typeof entry.indexMtimeMs === 'number' || entry.indexMtimeMs === null);
}

function isCacheEntryFresh(
    entry: GitCacheEntry,
    metadata: GitRepoMetadata | null,
    ttlMs: number,
    now: number
): boolean {
    if (metadata) {
        if (entry.headMtimeMs !== metadata.headMtimeMs || entry.indexMtimeMs !== metadata.indexMtimeMs) {
            return false;
        }
    }

    return ttlMs === 0 || now - entry.createdAt <= ttlMs;
}

function readPersistentCache(cachePath: string): PersistentGitCache | null {
    try {
        const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const data = parsed as { version?: unknown; cwd?: unknown; entries?: unknown };
        if (
            data.version !== GIT_CACHE_SCHEMA_VERSION
            || (typeof data.cwd !== 'string' && data.cwd !== null)
            || typeof data.entries !== 'object'
            || data.entries === null
        ) {
            return null;
        }

        const entries: Record<string, GitCacheEntry> = {};
        for (const [key, value] of Object.entries(data.entries)) {
            if (isCacheEntry(value)) {
                entries[key] = value;
            }
        }

        return {
            version: GIT_CACHE_SCHEMA_VERSION,
            cwd: data.cwd,
            entries
        };
    } catch {
        return null;
    }
}

function writePersistentCache(cachePath: string, cache: PersistentGitCache): void {
    // Stable temp name: a held handle (e.g. a Windows virus scanner or sync
    // client) can make the rename and the cleanup unlink both fail with
    // EPERM, so a unique name would leak one file per write. Reusing one
    // name bounds that to a single orphan per repo that the next write
    // truncates. Costs: while the handle is held, writes for that repo fail
    // (just extra cache misses), and a concurrent writer can tear the
    // renamed-over cache file - readPersistentCache treats malformed JSON
    // as a miss either way.
    const tempPath = `${cachePath}.tmp`;
    try {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(tempPath, JSON.stringify(cache), 'utf-8');
        fs.renameSync(tempPath, cachePath);
    } catch {
        // Best-effort cache; statusline rendering should never fail because
        // of it, so unlike config.ts:writeSettingsJson we do not rethrow.
        try {
            fs.unlinkSync(tempPath);
        } catch { /* best-effort cleanup; ignore */ }
    }
}

function readPersistentCacheEntry(
    metadata: GitRepoMetadata | null,
    cacheKey: string,
    cwd: string | undefined,
    ttlMs: number,
    now: number
): GitCacheEntry | null {
    if (!metadata) {
        return null;
    }

    const cache = readPersistentCache(metadata.cachePath);
    if (cache?.cwd !== (cwd ?? null)) {
        return null;
    }

    const entry = cache.entries[cacheKey];
    if (!entry || !isCacheEntryFresh(entry, metadata, ttlMs, now)) {
        return null;
    }

    return entry;
}

function writePersistentCacheEntry(
    metadata: GitRepoMetadata | null,
    cacheKey: string,
    cwd: string | undefined,
    entry: GitCacheEntry
): void {
    if (!metadata) {
        return;
    }

    const cacheCwd = cwd ?? null;
    const existingCache = readPersistentCache(metadata.cachePath);
    const cache: PersistentGitCache = existingCache?.cwd === cacheCwd
        ? existingCache
        : {
            version: GIT_CACHE_SCHEMA_VERSION,
            cwd: cacheCwd,
            entries: {}
        };

    cache.entries[cacheKey] = entry;
    writePersistentCache(metadata.cachePath, cache);
}

function createCacheEntry(output: string | null, metadata: GitRepoMetadata | null, now: number): GitCacheEntry {
    return {
        output,
        createdAt: now,
        headMtimeMs: metadata?.headMtimeMs ?? null,
        indexMtimeMs: metadata?.indexMtimeMs ?? null
    };
}

export function resolveGitCwd(context: RenderContext): string | undefined {
    const candidates = [
        context.data?.cwd,
        context.data?.workspace?.current_dir,
        context.data?.workspace?.project_dir
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate;
        }
    }

    return undefined;
}

export function runGit(command: string, context: RenderContext): string | null {
    const args = command.trim().split(/\s+/).filter(Boolean);
    return runGitArgs(args, context, command);
}

export function runGitArgs(args: string[], context: RenderContext, cacheCommand?: string): string | null {
    const cwd = resolveGitCwd(context);
    const cacheToken = cacheCommand ?? args.join('\0');
    const memoryCacheKey = `${cacheToken}|${cwd ?? ''}`;
    const persistentCacheKey = cacheToken;
    const metadata = getGitRepoMetadata(cwd);
    if (!metadata && cwd && isDefinitelyOutsideGitRepository(cwd)) {
        // Outside any repository git would only exit 128; nothing to cache
        // either, since there is no git dir to key a persistent entry on.
        return null;
    }

    const ttlMs = getGitCacheTtlMs(context);
    const now = Date.now();

    // Check cache first
    const memoryEntry = gitCommandCache.get(memoryCacheKey);
    if (memoryEntry && isCacheEntryFresh(memoryEntry, metadata, ttlMs, now)) {
        return memoryEntry.output;
    }

    const persistentEntry = readPersistentCacheEntry(metadata, persistentCacheKey, cwd, ttlMs, now);
    if (persistentEntry) {
        gitCommandCache.set(memoryCacheKey, persistentEntry);
        return persistentEntry.output;
    }

    try {
        const output = execGit(args, cwd).trimEnd();

        const result = output.length > 0 ? output : null;
        const entry = createCacheEntry(result, metadata, now);
        gitCommandCache.set(memoryCacheKey, entry);
        writePersistentCacheEntry(metadata, persistentCacheKey, cwd, entry);
        return result;
    } catch {
        const entry = createCacheEntry(null, metadata, now);
        gitCommandCache.set(memoryCacheKey, entry);
        writePersistentCacheEntry(metadata, persistentCacheKey, cwd, entry);
        return null;
    }
}

/**
 * Clear git command cache - for testing only
 */
export function clearGitCache(): void {
    gitCommandCache.clear();
    filterOverrideCache.clear();
}

export function isInsideGitWorkTree(context: RenderContext): boolean {
    return runGit('rev-parse --is-inside-work-tree', context) === 'true';
}

function parseDiffShortStat(stat: string): GitChangeCounts {
    const insertMatch = /(\d+)\s+insertions?/.exec(stat);
    const deleteMatch = /(\d+)\s+deletions?/.exec(stat);

    return {
        insertions: insertMatch?.[1] ? Number.parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch?.[1] ? Number.parseInt(deleteMatch[1], 10) : 0
    };
}

export function getGitChangeCounts(context: RenderContext): GitChangeCounts {
    const unstagedStat = runGit('diff --shortstat', context) ?? '';
    const stagedStat = runGit('diff --cached --shortstat', context) ?? '';
    const unstagedCounts = parseDiffShortStat(unstagedStat);
    const stagedCounts = parseDiffShortStat(stagedStat);

    return {
        insertions: unstagedCounts.insertions + stagedCounts.insertions,
        deletions: unstagedCounts.deletions + stagedCounts.deletions
    };
}

function hasRenameOrCopyStatus(line: string): boolean {
    return line.startsWith('R') || line.startsWith('C') || line[1] === 'R' || line[1] === 'C';
}

export interface GitStatus {
    staged: boolean;
    unstaged: boolean;
    untracked: boolean;
    conflicts: boolean;
}

export function getGitStatus(context: RenderContext): GitStatus {
    const output = runGit('status --porcelain -z', context);

    if (!output) {
        return { staged: false, unstaged: false, untracked: false, conflicts: false };
    }

    let staged = false;
    let unstaged = false;
    let untracked = false;
    let conflicts = false;

    const entries = output.split('\0');

    for (let index = 0; index < entries.length; index += 1) {
        const line = entries[index];
        if (typeof line !== 'string' || line.length < 2)
            continue;
        // Conflict detection: DD, AU, UD, UA, DU, AA, UU
        if (!conflicts && /^(DD|AU|UD|UA|DU|AA|UU)/.test(line))
            conflicts = true;
        if (!staged && /^[MADRCTU]/.test(line))
            staged = true;
        if (!unstaged && /^.[MADRCTU]/.test(line))
            unstaged = true;
        if (!untracked && line.startsWith('??'))
            untracked = true;
        if (staged && unstaged && untracked && conflicts)
            break;

        if (hasRenameOrCopyStatus(line)) {
            index += 1;
        }
    }

    return { staged, unstaged, untracked, conflicts };
}

export function getGitFileStatusCounts(context: RenderContext): GitFileStatusCounts {
    const output = runGit('status --porcelain -z', context);

    if (!output) {
        return { staged: 0, unstaged: 0, untracked: 0 };
    }

    let staged = 0;
    let unstaged = 0;
    let untracked = 0;

    const entries = output.split('\0');

    for (let index = 0; index < entries.length; index += 1) {
        const line = entries[index];
        if (typeof line !== 'string' || line.length < 2)
            continue;

        if (line.startsWith('??')) {
            untracked += 1;
        } else {
            if (/^[MADRCTU]/.test(line))
                staged += 1;
            if (/^.[MADRCTU]/.test(line))
                unstaged += 1;
        }

        if (hasRenameOrCopyStatus(line)) {
            index += 1;
        }
    }

    return { staged, unstaged, untracked };
}

export interface GitAheadBehind {
    ahead: number;
    behind: number;
}

export function getGitAheadBehind(context: RenderContext): GitAheadBehind | null {
    const output = runGit('rev-list --left-right --count HEAD...@{upstream}', context);
    if (!output)
        return null;

    const parts = output.split(/\s+/);
    if (parts.length !== 2 || !parts[0] || !parts[1])
        return null;

    const ahead = Number.parseInt(parts[0], 10);
    const behind = Number.parseInt(parts[1], 10);

    if (Number.isNaN(ahead) || Number.isNaN(behind))
        return null;

    return { ahead, behind };
}

export function getGitConflictCount(context: RenderContext): number {
    const output = runGit('ls-files --unmerged', context);
    if (!output)
        return 0;

    // Count unique file paths (unmerged files appear 3 times in output)
    const files = new Set(output.split('\n').map((line) => {
        const parts = line.split(/\s+/).slice(3);
        return parts.join(' ');
    }).filter(path => path.length > 0));
    return files.size;
}

export function getGitShortSha(context: RenderContext): string | null {
    return runGit('rev-parse --short HEAD', context);
}
