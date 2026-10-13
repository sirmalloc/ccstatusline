import type { SpawnSyncReturns } from 'node:child_process';
import {
    spawn,
    spawnSync
} from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { RenderContext } from '../types/RenderContext';
import type { WidgetItem } from '../types/Widget';

import { captureCustomCommand } from './custom-command-capture';

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

const DEFAULT_CUSTOM_COMMAND_CACHE_TTL_SECONDS = 0;
const MAX_CUSTOM_COMMAND_CACHE_TTL_SECONDS = 60;
const CUSTOM_COMMAND_CACHE_SCHEMA_VERSION = 1 as const;

// A status line is one terminal row, so anything past this cannot be displayed.
// Bounding it keeps a chatty command from bloating the cache file, which every
// widget in the render pass rewrites in full.
const MAX_CACHED_OUTPUT_CHARS = 16_384;

// Bound capture itself, even when caching is disabled. No stdout is spooled to disk.
const MAX_STDOUT_BYTES = 1024 * 1024;

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

function executeCommand(request: CustomCommandRequest): CustomCommandResult {
    try {
        // Only the capture runtime owns this pipe. The command's descendants
        // cannot inherit it and keep spawnSync waiting after their shell exits.
        // Keep CommonJS requires unprefixed for Node versions before 14.18;
        // this script runs verbatim and is not transformed by the bundler.
        const script = `(${captureCustomCommand.toString()})(
            require('child_process').spawn,
            JSON.parse(require('fs').readFileSync(0, 'utf8')),
            ${MAX_STDOUT_BYTES}, ${MAX_CACHED_OUTPUT_CHARS},
            (result) => process.stdout.write(JSON.stringify(result), () => process.exit(0))
        )`;
        const result = spawnSync(process.execPath, ['-e', script], {
            encoding: 'utf8',
            input: JSON.stringify(request),
            stdio: ['pipe', 'pipe', 'ignore'],
            maxBuffer: MAX_STDOUT_BYTES,
            // The child enforces the command deadline. Allow runtime startup and
            // result delivery here, with a backstop if the helper fails to reply.
            timeout: request.timeoutMs > 0 ? request.timeoutMs + 1000 : 0,
            killSignal: 'SIGKILL',
            env: process.env,
            windowsHide: true
        });
        const marker = getFailureMarker(result);
        if (marker !== null) {
            return { status: 'failed', marker };
        }
        return JSON.parse(result.stdout) as CustomCommandResult;
    } catch {
        return { status: 'failed', marker: '[Error]' };
    }
}

/**
 * Run a command in this process, without the synchronous path's helper runtime.
 *
 * @remarks
 * The capture owns the pipe and destroys it on delivery, so a background
 * descendant that keeps stdout open cannot hold this process open either.
 */
function executeCommandAsync(request: CustomCommandRequest): Promise<CustomCommandResult> {
    return new Promise((resolve) => {
        let settled = false;
        let backstop: ReturnType<typeof setTimeout> | undefined;
        const settle = (result: CustomCommandResult): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(backstop);
            resolve(result);
        };

        // The capture enforces the command deadline. This mirrors the synchronous
        // path's spawnSync timeout, in case the capture never delivers.
        if (request.timeoutMs > 0) {
            backstop = setTimeout(() => {
                settle({ status: 'failed', marker: '[Timeout]' });
            }, request.timeoutMs + 1000);
        }

        try {
            captureCustomCommand(spawn, request, MAX_STDOUT_BYTES, MAX_CACHED_OUTPUT_CHARS, settle);
        } catch {
            settle({ status: 'failed', marker: '[Error]' });
        }
    });
}

interface CacheSlot {
    ttlMs: number;
    cwd: string;
    entryKey: string;
    memoryCacheKey: string;
    canShareAcrossProcesses: boolean;
}

function getCacheSlot(request: CustomCommandRequest, ttlMs: number): CacheSlot {
    const cwd = process.cwd();
    const entryKey = getEntryKey(request);

    return {
        ttlMs,
        cwd,
        entryKey,
        memoryCacheKey: `${entryKey}\0${cwd}`,
        canShareAcrossProcesses: typeof request.sessionId === 'string' && request.sessionId.length > 0
    };
}

function readCachedResult(slot: CacheSlot): CustomCommandResult | null {
    const now = Date.now();

    const memoryEntry = customCommandCache.get(slot.memoryCacheKey);
    if (memoryEntry && isCacheEntryFresh(memoryEntry, slot.ttlMs, now)) {
        return memoryEntry.result;
    }

    if (slot.canShareAcrossProcesses) {
        const persistentEntry = readPersistentCacheEntry(slot.cwd, slot.entryKey, slot.ttlMs, now);
        if (persistentEntry) {
            customCommandCache.set(slot.memoryCacheKey, persistentEntry);
            return persistentEntry.result;
        }
    }

    return null;
}

function storeResult(slot: CacheSlot, result: CustomCommandResult): void {
    // Stamped after the run, so a command slower than the TTL still gets the
    // full TTL of reuse rather than expiring the moment it returns.
    const entry: CustomCommandCacheEntry = {
        result,
        createdAt: Date.now()
    };
    customCommandCache.set(slot.memoryCacheKey, entry);
    if (slot.canShareAcrossProcesses) {
        writePersistentCacheEntry(slot.cwd, slot.entryKey, entry, entry.createdAt);
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
export function runCustomCommand(
    request: CustomCommandRequest,
    prefetched?: CustomCommandResults | null
): CustomCommandResult {
    // The render prefetch normally has the result already. Anything it missed
    // still runs, synchronously.
    const prefetchedResult = prefetched?.get(getCustomCommandResultKey(request));
    if (prefetchedResult) {
        return prefetchedResult;
    }

    const ttlMs = getCacheTtlMs(request.ttlSeconds);
    if (ttlMs === 0) {
        return executeCommand(request);
    }

    const slot = getCacheSlot(request, ttlMs);
    const cached = readCachedResult(slot);
    if (cached) {
        return cached;
    }

    const result = executeCommand(request);
    storeResult(slot, result);
    return result;
}

/**
 * {@link runCustomCommand} without blocking, so several commands can run at once.
 * It never rejects: every failure resolves to a marker.
 */
export async function runCustomCommandAsync(request: CustomCommandRequest): Promise<CustomCommandResult> {
    const ttlMs = getCacheTtlMs(request.ttlSeconds);
    if (ttlMs === 0) {
        return executeCommandAsync(request);
    }

    const slot = getCacheSlot(request, ttlMs);
    const cached = readCachedResult(slot);
    if (cached) {
        return cached;
    }

    const result = await executeCommandAsync(request);
    storeResult(slot, result);
    return result;
}

/** The render-context fields a custom command request is built from. */
export type CustomCommandRequestContext = Pick<RenderContext, 'data' | 'terminalWidth' | 'customCommandCacheTtlSeconds'>;

/** Results the render prefetch already has, keyed by {@link getCustomCommandResultKey}. */
export type CustomCommandResults = Map<string, CustomCommandResult>;

/**
 * Build the request a custom command widget runs, or null when it runs nothing.
 * It must match what CustomCommandWidget sends, or the prefetch always misses.
 */
export function createCustomCommandRequest(
    item: WidgetItem,
    context: CustomCommandRequestContext
): CustomCommandRequest | null {
    if (!item.commandPath || !context.data) {
        return null;
    }

    const input = JSON.stringify(
        typeof context.terminalWidth === 'number'
            ? { ...context.data, terminal_width: context.terminalWidth }
            : context.data
    );

    return {
        command: item.commandPath,
        input,
        timeoutMs: item.timeout ?? 1000,
        ttlSeconds: context.customCommandCacheTtlSeconds,
        sessionId: context.data.session_id,
        terminalWidth: context.terminalWidth
    };
}

/** Identifies a request completely, including the payload the cache key omits. */
export function getCustomCommandResultKey(request: CustomCommandRequest): string {
    return [
        getEntryKey(request),
        String(request.ttlSeconds ?? ''),
        request.input
    ].join('\0');
}

/**
 * Run every custom command widget's command at once, ahead of the synchronous
 * render, so a status line with several commands waits for the slowest one
 * rather than their sum.
 *
 * @remarks
 * Identical requests run once and share the result. It never rejects.
 */
export async function prefetchCustomCommandsIfNeeded(
    lines: WidgetItem[][],
    context: CustomCommandRequestContext
): Promise<CustomCommandResults | null> {
    const pending = new Map<string, Promise<CustomCommandResult>>();

    for (const line of lines) {
        for (const item of line) {
            if (item.type !== 'custom-command') {
                continue;
            }

            const request = createCustomCommandRequest(item, context);
            if (!request) {
                continue;
            }

            const key = getCustomCommandResultKey(request);
            if (!pending.has(key)) {
                pending.set(key, runCustomCommandAsync(request).catch((): CustomCommandResult => ({ status: 'failed', marker: '[Error]' })));
            }
        }
    }

    if (pending.size === 0) {
        return null;
    }

    const results: CustomCommandResults = new Map();
    await Promise.all(Array.from(pending, async ([key, promise]) => {
        results.set(key, await promise);
    }));
    return results;
}

/**
 * Clear the in-process custom command cache - for testing only
 */
export function clearCustomCommandCache(): void {
    customCommandCache.clear();
}
