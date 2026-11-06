import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const CACHE_DIR_NAME = 'ccstatusline';

let writableCacheDir: string | null = null;

// Creates the folder if needed and reports whether files can be added to it.
function isWritableDir(dir: string): boolean {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

// The system temp folder is shared between accounts on Linux, so the
// fallback is only used while it is a real folder this account owns and no
// other account can write to. A folder another account created first could
// otherwise feed this one made-up usage data or backoff locks.
function isPrivateDir(dir: string): boolean {
    try {
        fs.mkdirSync(dir, { mode: 0o700 });
    } catch {
        // Already there, or not creatable: the checks below decide
    }

    try {
        const stats = fs.lstatSync(dir);
        const uid = process.getuid?.();
        if (!stats.isDirectory()) {
            return false;
        }
        if (uid !== undefined && (stats.uid !== uid || (stats.mode & 0o022) !== 0)) {
            return false;
        }
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

function resolveWritableCacheDir(homeDir: string, tmpDir: string): string {
    const preferred = path.join(homeDir, '.cache', CACHE_DIR_NAME);
    if (isWritableDir(preferred)) {
        return preferred;
    }

    const uid = process.getuid?.();
    const fallback = path.join(tmpDir, uid === undefined ? CACHE_DIR_NAME : `${CACHE_DIR_NAME}-${uid}`);
    return isPrivateDir(fallback) ? fallback : preferred;
}

/**
 * The folder for the usage and Claude Status caches and their fetch backoff
 * locks: ~/.cache/ccstatusline, or, when that can't be created or written (a
 * ~/.cache left owned by root, a read-only home), a folder of this account's
 * own in the system temp folder. Every render is a new process, so these
 * files are the only throttle between renders; with nowhere to keep them,
 * every render would call the APIs again. Resolved once per process.
 */
export function getWritableCacheDir(): string {
    writableCacheDir = writableCacheDir ?? resolveWritableCacheDir(os.homedir(), os.tmpdir());
    return writableCacheDir;
}

// Exposed only for tests, which can't redirect os.homedir() in every runtime:
// resolving for given folders, and pointing the cached folder at a sandbox
// (null resolves it again on next use).
export const __testing = {
    resolveWritableCacheDir,
    setWritableCacheDir: (dir: string | null): void => {
        writableCacheDir = dir;
    }
};
