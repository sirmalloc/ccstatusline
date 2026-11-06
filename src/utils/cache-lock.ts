import * as fs from 'node:fs';

// A lock older than this is assumed to belong to a writer that crashed
// mid-write rather than one that is merely slow; stealing it lets the cache
// recover instead of wedging permanently.
const LOCK_STALE_MS = 2000;

function isEexist(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EEXIST';
}

/**
 * Best-effort mutual exclusion for a cache file's read-modify-write (for
 * example writeCachedWidth). Without this, two ccstatusline processes (e.g. two concurrent Claude Code
 * sessions) racing to write the same cache file can each read a snapshot
 * that doesn't include the other's entry yet, and whichever renames last
 * silently clobbers the other's write.
 *
 * Uses O_CREAT|O_EXCL on a `.lock` file as the exclusion primitive (atomic on
 * POSIX filesystems). Non-blocking: if the lock is held and fresh, the caller
 * skips this write entirely rather than spinning -- the cache is best-effort,
 * so losing one write is fine, but corrupting/clobbering another writer's
 * entry is not. A lock older than LOCK_STALE_MS is assumed abandoned by a
 * crashed writer and is stolen so the cache can't wedge permanently.
 */
export function withCacheLock(cachePath: string, fn: () => void): void {
    const lockPath = `${cachePath}.lock`;
    let haveLock = false;
    // Only EEXIST means "another writer genuinely holds the lock" -- anything
    // else (EMFILE under fd pressure, a missing directory, etc.) is unrelated
    // to contention, so the write proceeds unlocked rather than being dropped:
    // this locking is additive protection, and must never make the cache less
    // reliable than it was before locking existed.
    let contended = false;

    try {
        try {
            fs.closeSync(fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY));
            haveLock = true;
        } catch (error) {
            if (isEexist(error)) {
                contended = true;
                try {
                    if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
                        fs.unlinkSync(lockPath);
                        fs.closeSync(fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY));
                        haveLock = true;
                        contended = false;
                    }
                } catch {
                    // Still contended, or another writer already recovered it; skip this write.
                }
            }
        }

        if (haveLock || !contended) {
            fn();
        }
    } finally {
        if (haveLock) {
            try {
                fs.unlinkSync(lockPath);
            } catch {
                // best-effort
            }
        }
    }
}
