import type {
    SpawnSyncOptionsWithStringEncoding,
    SpawnSyncReturns
} from 'child_process';
import { spawnSync } from 'child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Outcome of one custom command invocation. */
export type CustomCommandResult
    = | { status: 'ok'; stdout: string }
        | { status: 'failed'; marker: string };

export interface CustomCommandRequest {
    /** Shell command line to run. */
    command: string;
    /** JSON payload piped to the command on stdin. */
    input: string;
    /** Milliseconds the command may run before it is killed. */
    timeoutMs: number;
    /** Seconds an earlier result stays reusable; 0 runs the command every time. */
    ttlSeconds?: number;
    /** Claude Code session, so two sessions never read each other's output. */
    sessionId?: string;
    /**
     * Terminal width piped to the command, which width-sensitive output depends
     * on. Keying on it means a resize shows correct output at once instead of
     * waiting out the TTL.
     */
    terminalWidth?: number | null;
}

interface CustomCommandCacheEntry {
    result: CustomCommandResult;
    createdAt: number;
}

interface PersistentCustomCommandCache {
    version: 1;
    cwd: string;
    entries: Record<string, CustomCommandCacheEntry>;
}

/** Owner-only temp directory holding the command's stdin payload and its stdout. */
interface CommandIo {
    dir: string;
    payloadFd: number;
    stdoutFd: number;
    stdoutPath: string;
}

/**
 * Spawn options plus `detached`, which @types/node lists only for the async
 * spawn. Node honors it for spawnSync too, and the POSIX tree kill depends on
 * it: without it the shell shares our process group and no group exists to
 * signal.
 */
interface SyncShellOptions extends SpawnSyncOptionsWithStringEncoding { detached?: boolean }

const DEFAULT_CUSTOM_COMMAND_CACHE_TTL_SECONDS = 0;
const MAX_CUSTOM_COMMAND_CACHE_TTL_SECONDS = 60;
const CUSTOM_COMMAND_CACHE_SCHEMA_VERSION = 1 as const;

// A status line is one terminal row, so anything past this cannot be displayed.
// Bounding it keeps a chatty command from bloating the cache file, which every
// widget in the render pass rewrites in full.
const MAX_CACHED_OUTPUT_CHARS = 16_384;

// Only reachable on the fallback path, where stdout is still a pipe.
const MAX_PIPED_STDOUT_BYTES = 1024 * 1024;

function isWindows(): boolean {
    return process.platform === 'win32';
}

// In-process cache keeps cwd in the key. The persistent cache stores cwd once at
// the file level and keys entries by command, session and terminal width.
const customCommandCache = new Map<string, CustomCommandCacheEntry>();

function getCacheDir(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline');
}

function getCachePath(cwd: string): string {
    const cwdHash = createHash('sha256')
        .update(cwd)
        .digest('hex')
        .slice(0, 16);

    return path.join(getCacheDir(), 'custom-command-cache', `cmd-${cwdHash}.json`);
}

function getCacheTtlMs(ttlSeconds: number | undefined): number {
    if (typeof ttlSeconds !== 'number' || !Number.isFinite(ttlSeconds)) {
        return DEFAULT_CUSTOM_COMMAND_CACHE_TTL_SECONDS * 1000;
    }

    return Math.min(MAX_CUSTOM_COMMAND_CACHE_TTL_SECONDS, Math.max(0, ttlSeconds)) * 1000;
}

function getEntryKey(request: CustomCommandRequest): string {
    return [
        request.command,
        String(request.timeoutMs),
        request.sessionId ?? '',
        typeof request.terminalWidth === 'number' ? String(request.terminalWidth) : ''
    ].join('\0');
}

function isCacheEntry(value: unknown): value is CustomCommandCacheEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    if (typeof entry.createdAt !== 'number' || typeof entry.result !== 'object' || entry.result === null) {
        return false;
    }

    const result = entry.result as Record<string, unknown>;
    if (result.status === 'ok') {
        return typeof result.stdout === 'string';
    }

    return result.status === 'failed' && typeof result.marker === 'string';
}

function isCacheEntryFresh(entry: CustomCommandCacheEntry, ttlMs: number, now: number): boolean {
    const age = now - entry.createdAt;

    // A negative age means the entry carries a clock ahead of ours, so treat it
    // as a miss rather than trusting it until that clock catches up.
    return age >= 0 && age <= ttlMs;
}

function readPersistentCache(cachePath: string): PersistentCustomCommandCache | null {
    try {
        const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const data = parsed as { version?: unknown; cwd?: unknown; entries?: unknown };
        if (
            data.version !== CUSTOM_COMMAND_CACHE_SCHEMA_VERSION
            || typeof data.cwd !== 'string'
            || typeof data.entries !== 'object'
            || data.entries === null
        ) {
            return null;
        }

        const entries: Record<string, CustomCommandCacheEntry> = {};
        for (const [key, value] of Object.entries(data.entries)) {
            if (isCacheEntry(value)) {
                entries[key] = value;
            }
        }

        return {
            version: CUSTOM_COMMAND_CACHE_SCHEMA_VERSION,
            cwd: data.cwd,
            entries
        };
    } catch {
        return null;
    }
}

function writePersistentCache(cachePath: string, cache: PersistentCustomCommandCache): void {
    try {
        // Owner-only, because a custom command prints whatever its author chose to
        // print. Git metadata is predictable, arbitrary command output is not.
        fs.mkdirSync(path.dirname(cachePath), { recursive: true, mode: 0o700 });
        const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(cache), { encoding: 'utf-8', mode: 0o600 });
        fs.renameSync(tempPath, cachePath);
    } catch {
        // Best-effort cache. Statusline rendering must never fail because of it.
    }
}

function readPersistentCacheEntry(
    cwd: string,
    entryKey: string,
    ttlMs: number,
    now: number
): CustomCommandCacheEntry | null {
    const cache = readPersistentCache(getCachePath(cwd));
    if (cache?.cwd !== cwd) {
        return null;
    }

    const entry = cache.entries[entryKey];
    if (!entry || !isCacheEntryFresh(entry, ttlMs, now)) {
        return null;
    }

    return entry;
}

function pruneExpiredEntries(
    entries: Record<string, CustomCommandCacheEntry>,
    now: number
): Record<string, CustomCommandCacheEntry> {
    // Session ids keep changing, so drop anything no configurable TTL can still
    // serve. Without this the file grows once per session forever.
    const maxAgeMs = MAX_CUSTOM_COMMAND_CACHE_TTL_SECONDS * 1000;
    const kept: Record<string, CustomCommandCacheEntry> = {};

    for (const [key, entry] of Object.entries(entries)) {
        if (isCacheEntryFresh(entry, maxAgeMs, now)) {
            kept[key] = entry;
        }
    }

    return kept;
}

function writePersistentCacheEntry(
    cwd: string,
    entryKey: string,
    entry: CustomCommandCacheEntry,
    now: number
): void {
    const cachePath = getCachePath(cwd);
    const existingCache = readPersistentCache(cachePath);
    const entries = existingCache?.cwd === cwd
        ? pruneExpiredEntries(existingCache.entries, now)
        : {};

    entries[entryKey] = entry;
    writePersistentCache(cachePath, {
        version: CUSTOM_COMMAND_CACHE_SCHEMA_VERSION,
        cwd,
        entries
    });
}

/** Reads the errno string off a spawn error, which the Error type does not carry. */
function getErrorCode(error: unknown): string | undefined {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
        return error.code;
    }

    return undefined;
}

function getFailureMarker(result: SpawnSyncReturns<string>): string | null {
    const errorCode = getErrorCode(result.error);

    if (errorCode === 'ENOENT') {
        return '[Cmd not found]';
    } else if (errorCode === 'ETIMEDOUT') {
        return '[Timeout]';
    } else if (errorCode === 'EACCES') {
        return '[Permission denied]';
    } else if (result.error) {
        return '[Error]';
    } else if (result.signal) {
        return `[Signal: ${result.signal}]`;
    } else if (typeof result.status !== 'number') {
        return '[Error]';
    } else if (result.status !== 0) {
        return `[Exit: ${result.status}]`;
    }

    return null;
}

function closeDescriptor(fd: number): void {
    try {
        fs.closeSync(fd);
    } catch {
        // Already closed, so there is nothing left to release.
    }
}

function removeDirectory(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        // A descendant can still hold a handle here on Windows. The directory
        // lives under the temp root and is safe to leave for the OS to reap.
    }
}

/**
 * Give the command both of its stdio streams as files rather than pipes.
 *
 * @remarks
 * Every process in the shell tree inherits the pipe handles, and spawnSync
 * returns only once every inheritor has closed them. One backgrounded
 * descendant therefore holds the render open for as long as it lives, whatever
 * the configured timeout says. Measured on Linux, `( sleep 3 ; echo LATE ) &`
 * held a piped spawnSync for 3006ms and delivered output written after the
 * shell had exited. The same command against files returns in 3ms.
 *
 * mkdtemp is what makes the paths safe to use: it creates an owner-only
 * directory with an unguessable name in one atomic step, so neither file can be
 * pre-created as a symlink or swapped between being written and being opened.
 */
function openCommandIo(input: string): CommandIo | null {
    let dir: string | undefined;
    let payloadFd: number | undefined;
    let stdoutFd: number | undefined;

    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cmd-'));
        const payloadPath = path.join(dir, 'stdin.json');
        const stdoutPath = path.join(dir, 'stdout.txt');

        fs.writeFileSync(payloadPath, input, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
        payloadFd = fs.openSync(payloadPath, 'r');
        stdoutFd = fs.openSync(stdoutPath, 'wx', 0o600);

        return {
            dir,
            payloadFd,
            stdoutFd,
            stdoutPath
        };
    } catch {
        if (payloadFd !== undefined) {
            closeDescriptor(payloadFd);
        }
        if (stdoutFd !== undefined) {
            closeDescriptor(stdoutFd);
        }
        if (dir !== undefined) {
            removeDirectory(dir);
        }

        return null;
    }
}

function closeCommandIo(io: CommandIo): void {
    closeDescriptor(io.payloadFd);
    closeDescriptor(io.stdoutFd);
    removeDirectory(io.dir);
}

function readCapturedStdout(io: CommandIo): string {
    try {
        return fs.readFileSync(io.stdoutPath, 'utf-8');
    } catch {
        return '';
    }
}

/**
 * Kill everything the shell started, not just the shell.
 *
 * @remarks
 * A timeout signals the shell alone, so a pipeline such as `curl ... | jq ...`
 * leaves its remaining members running. On POSIX `detached: true` gives the shell
 * its own process group, and that group outlives its leader, so a negated pid
 * still reaches every member.
 *
 * Windows has no equivalent here: spawnSync returns only after terminating the
 * shell, and `taskkill /T` needs a live pid to walk down from, so descendants
 * there run until they exit on their own.
 */
function killProcessGroup(pid: number | undefined): void {
    if (isWindows() || typeof pid !== 'number') {
        return;
    }

    try {
        process.kill(-pid, 'SIGKILL');
    } catch {
        // ESRCH once the group has already exited, which is the common case.
    }
}

function executeCommand(request: CustomCommandRequest): CustomCommandResult {
    const io = openCommandIo(request.input);

    try {
        const options: SyncShellOptions = {
            shell: true,
            encoding: 'utf8',
            timeout: request.timeoutMs,
            stdio: io ? [io.payloadFd, io.stdoutFd, 'ignore'] : ['pipe', 'pipe', 'ignore'],
            // Pinned rather than inherited, so a change to Node's default cannot
            // silently turn large output into a failure marker.
            maxBuffer: MAX_PIPED_STDOUT_BYTES,
            env: process.env,
            windowsHide: true,
            detached: !isWindows()
        };

        // Falling back to pipes keeps a temp directory problem from blanking the
        // widget, at the cost of the timing guarantee above.
        if (!io) {
            options.input = request.input;
        }

        const result = spawnSync(request.command, options);

        const marker = getFailureMarker(result);
        if (marker !== null) {
            // Only a timeout can leave the tree running. A command that exited on
            // its own may have deliberately left a background job behind.
            if (marker === '[Timeout]') {
                killProcessGroup(result.pid);
            }

            return {
                status: 'failed',
                marker
            };
        }

        const stdout = io ? readCapturedStdout(io) : result.stdout;

        return {
            status: 'ok',
            stdout: stdout.slice(0, MAX_CACHED_OUTPUT_CHARS).trim()
        };
    } catch {
        return {
            status: 'failed',
            marker: '[Error]'
        };
    } finally {
        if (io) {
            closeCommandIo(io);
        }
    }
}

/**
 * Run a custom command, reusing a recent result when one is still within the TTL.
 *
 * @remarks
 * Claude Code runs the status line as a fresh process per repaint. An in-process
 * map alone would therefore never hit, so the cache is persisted to disk next to
 * the git cache.
 *
 * The key covers the command, its timeout, the session and the terminal width. It
 * deliberately omits the rest of the piped payload, which carries token counts
 * that change on nearly every repaint and would make every lookup a miss.
 *
 * Without a session id there is nothing to separate one session's output from
 * another's, so the result stays in this process rather than reaching the file
 * every session shares.
 */
export function runCustomCommand(request: CustomCommandRequest): CustomCommandResult {
    const ttlMs = getCacheTtlMs(request.ttlSeconds);
    if (ttlMs === 0) {
        return executeCommand(request);
    }

    const cwd = process.cwd();
    const entryKey = getEntryKey(request);
    const memoryCacheKey = `${entryKey}\0${cwd}`;
    const canShareAcrossProcesses = typeof request.sessionId === 'string' && request.sessionId.length > 0;
    const now = Date.now();

    const memoryEntry = customCommandCache.get(memoryCacheKey);
    if (memoryEntry && isCacheEntryFresh(memoryEntry, ttlMs, now)) {
        return memoryEntry.result;
    }

    if (canShareAcrossProcesses) {
        const persistentEntry = readPersistentCacheEntry(cwd, entryKey, ttlMs, now);
        if (persistentEntry) {
            customCommandCache.set(memoryCacheKey, persistentEntry);
            return persistentEntry.result;
        }
    }

    const result = executeCommand(request);
    // Stamped after the run, so a command slower than the TTL still gets the
    // full TTL of reuse rather than expiring the moment it returns.
    const entry: CustomCommandCacheEntry = {
        result,
        createdAt: Date.now()
    };
    customCommandCache.set(memoryCacheKey, entry);
    if (canShareAcrossProcesses) {
        writePersistentCacheEntry(cwd, entryKey, entry, entry.createdAt);
    }

    return result;
}

/**
 * Clear the in-process custom command cache - for testing only
 */
export function clearCustomCommandCache(): void {
    customCommandCache.clear();
}
