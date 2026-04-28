import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

const DEFAULT_DROP_THRESHOLD = 2;
const FRESH_PREV_CTX_PCT = -1;
const MAX_CACHE_FILE_BYTES = 4096;
const SESSION_ID_HASH_HEX_LEN = 32;

export interface CompactionState {
    count: number;
    prevCtxPct: number;
    prevWindowSize?: number | null;
}

const FRESH: CompactionState = { count: 0, prevCtxPct: FRESH_PREV_CTX_PCT };

const CompactionStateSchema = z.object({
    count: z.number().int().nonnegative().default(0),
    prevCtxPct: z.number().default(FRESH_PREV_CTX_PCT),
    prevWindowSize: z.number().positive().nullable().optional()
});

interface DetectCompactionOptions {
    dropThreshold?: number;
    windowSize?: number | null;
}

function normalizeWindowSize(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value;
}

function normalizeOptions(options: number | DetectCompactionOptions): Required<Pick<DetectCompactionOptions, 'dropThreshold'>> & Pick<DetectCompactionOptions, 'windowSize'> {
    if (typeof options === 'number') {
        return { dropThreshold: options, windowSize: null };
    }

    const dropThreshold = typeof options.dropThreshold === 'number' && Number.isFinite(options.dropThreshold)
        ? options.dropThreshold
        : DEFAULT_DROP_THRESHOLD;

    return { dropThreshold, windowSize: options.windowSize ?? null };
}

/**
 * Detect context compaction events.
 *
 * Within the same context window size, context only grows until compaction, so
 * any percentage drop beyond the threshold indicates Claude Code compacted the
 * conversation. The threshold filters rounding noise and cache accounting
 * wobble - a drop must exceed the threshold (default: more than 2 points) to
 * count. When a known context window size changes, the previous percentage
 * baseline is reset instead of counted as a compaction.
 *
 * Returns state unchanged when currentCtxPct is non-finite or negative,
 * preventing NaN from poisoning persistent state. The fresh-state sentinel
 * for prevCtxPct is -1, so a session that legitimately starts at 0% is
 * still detected correctly.
 */
export function detectCompaction(
    currentCtxPct: number,
    state: CompactionState,
    options: number | DetectCompactionOptions = DEFAULT_DROP_THRESHOLD
): CompactionState {
    if (!Number.isFinite(currentCtxPct) || currentCtxPct < 0) {
        return state;
    }

    const { dropThreshold, windowSize } = normalizeOptions(options);
    const currentWindowSize = normalizeWindowSize(windowSize);
    const prevWindowSize = normalizeWindowSize(state.prevWindowSize);
    let { count } = state;
    const { prevCtxPct } = state;
    const hasKnownWindowChange = currentWindowSize !== null && prevWindowSize !== null && currentWindowSize !== prevWindowSize;
    const isLearningWindowSize = currentWindowSize !== null && prevWindowSize === null && prevCtxPct >= 0;

    if (!hasKnownWindowChange && !isLearningWindowSize && prevCtxPct >= 0 && currentCtxPct < prevCtxPct - dropThreshold) {
        count += 1;
    }

    return {
        count,
        prevCtxPct: currentCtxPct,
        ...(currentWindowSize !== null ? { prevWindowSize: currentWindowSize } : {})
    };
}

function getCacheDir(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'compaction');
}

function sanitizeSessionId(sessionId: string): string {
    const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    // Hash if input was empty or contained any disallowed character — prevents
    // distinct sessions with all-illegal characters from collapsing to the same
    // cache filename, and prevents an empty leaf like "compaction-.json".
    if (!sanitized || sanitized !== sessionId) {
        return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, SESSION_ID_HASH_HEX_LEN);
    }
    return sanitized;
}

function getStatePath(sessionId: string): string {
    return path.join(getCacheDir(), `compaction-${sanitizeSessionId(sessionId)}.json`);
}

export function loadCompactionState(sessionId: string): CompactionState {
    const statePath = getStatePath(sessionId);
    let fd: number | null = null;
    try {
        // O_NOFOLLOW makes opening a symlinked path fail with ELOOP rather
        // than reading through the symlink. Combined with fstat on the open
        // fd (rather than a separate lstat-then-read), this also closes the
        // TOCTOU window that would otherwise let the path be swapped between
        // the stat and the read.
        fd = fs.openSync(statePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stats = fs.fstatSync(fd);
        if (!stats.isFile() || stats.size > MAX_CACHE_FILE_BYTES) {
            return FRESH;
        }
        const raw: unknown = JSON.parse(fs.readFileSync(fd, 'utf-8'));
        const result = CompactionStateSchema.safeParse(raw);
        return result.success ? result.data : FRESH;
    } catch {
        return FRESH;
    } finally {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch { /* ignore */ }
        }
    }
}

export function saveCompactionState(sessionId: string, state: CompactionState): void {
    let tmpPath: string | null = null;
    try {
        const dir = getCacheDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const targetPath = getStatePath(sessionId);
        // Write to a temp file in the same directory then rename. Rename on
        // POSIX replaces the target atomically and does not follow symlinks
        // at the destination — so a planted symlink at targetPath gets
        // replaced with the real file rather than written through.
        tmpPath = `${targetPath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
        fs.writeFileSync(tmpPath, JSON.stringify(state) + '\n');
        fs.renameSync(tmpPath, targetPath);
        tmpPath = null;
    } catch {
        // Best-effort — cache write failure should not break status line rendering.
        // Clean up an orphan temp file if rename failed after write succeeded.
        if (tmpPath !== null) {
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
    }
}
