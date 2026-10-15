import * as fs from 'node:fs';
import * as path from 'node:path';

// Filesystem layout and hygiene for the daemon's private IPC endpoints (#16):
// a per-user runtime directory (0700) holding the Unix socket (0600) and the
// discovery file (0600). Everything here fails closed: if a path component
// looks attacker-controlled (wrong owner, wrong type, symlink), the daemon
// refuses to start rather than cleaning up blindly.

/** The socket path must fit sun_path on every supported platform (macOS: 104 incl. NUL). */
export const MAX_SOCKET_PATH_BYTES = 103;

export const DISCOVERY_FILE_NAME = 'daemon.env';

/** Instance socket files carry their pid: daemon-<pid>.sock. */
const SOCKET_FILE_PATTERN = /^daemon-(\d+)\.sock$/;

function currentUid(): number | null {
    return typeof process.getuid === 'function' ? process.getuid() : null;
}

/**
 * Per-user runtime directory. Precedence: explicit override (also the test
 * seam), then the OS per-user runtime dir on Linux, then a uid-suffixed
 * temp dir everywhere else.
 */
export function getRuntimeDir(): string {
    const override = process.env.CCSTATUSLINE_RUNTIME_DIR;
    if (override) {
        return override;
    }
    const xdg = process.env.XDG_RUNTIME_DIR;
    if (xdg) {
        return path.join(xdg, 'ccstatusline');
    }
    const uid = currentUid() ?? 0;
    return path.join(process.env.TMPDIR ?? '/tmp', `ccstatusline-${uid}`);
}

/**
 * Per-instance socket path. The pid suffix makes the path exclusive to one
 * daemon process: http servers unlink their bind path on close, so two
 * instances sharing a path would let a shutting-down instance delete the
 * live one's socket. Clients never see the naming scheme — they read the
 * current path from the discovery file.
 */
export function getSocketPath(runtimeDir: string, pid: number = process.pid): string {
    return path.join(runtimeDir, `daemon-${pid}.sock`);
}

export function getDiscoveryPath(runtimeDir: string): string {
    return path.join(runtimeDir, DISCOVERY_FILE_NAME);
}

/**
 * Create (or adopt) the runtime directory and force it to 0700. Refuses to
 * touch a directory owned by another user.
 */
export function ensureRuntimeDir(runtimeDir: string): void {
    try {
        fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    } catch (error) {
        // A non-directory sitting at the path surfaces below as a clear
        // refusal instead of a raw EEXIST/ENOTDIR from mkdir.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error;
        }
    }

    const stats = fs.lstatSync(runtimeDir);
    if (!stats.isDirectory()) {
        throw new Error(`runtime path ${runtimeDir} is not a directory`);
    }
    const uid = currentUid();
    if (uid !== null && stats.uid !== uid) {
        throw new Error(`runtime directory ${runtimeDir} is owned by another user`);
    }
    if ((stats.mode & 0o777) !== 0o700) {
        fs.chmodSync(runtimeDir, 0o700);
    }
}

/**
 * Clear the way for a fresh socket. A leftover socket from a dead daemon is
 * unlinked only when it really is a socket owned by this user; anything else
 * (regular file, directory, symlink — including a symlink pointing at a
 * socket) aborts startup so cleanup can never follow an attacker-controlled
 * name. Callers keep the error and surface it on stderr.
 */
export function prepareSocketPath(socketPath: string): void {
    if (Buffer.byteLength(socketPath, 'utf8') > MAX_SOCKET_PATH_BYTES) {
        throw new Error(`socket path exceeds ${MAX_SOCKET_PATH_BYTES} bytes (Unix socket limit): ${socketPath}`);
    }

    let stats: fs.Stats | undefined;
    try {
        stats = fs.lstatSync(socketPath);
    } catch {
        return; // ENOENT: nothing stale to clean up.
    }

    if (stats.isSymbolicLink()) {
        throw new Error(`refusing to replace symlink at ${socketPath}`);
    }
    if (!stats.isSocket()) {
        throw new Error(`refusing to replace non-socket file at ${socketPath}`);
    }
    const uid = currentUid();
    if (uid !== null && stats.uid !== uid) {
        throw new Error(`refusing to remove socket at ${socketPath} owned by another user`);
    }
    fs.unlinkSync(socketPath);
}

/**
 * Delete sockets left behind by daemon pids that no longer exist (killed -9
 * never runs its cleanup). Only files matching the instance naming scheme,
 * only sockets owned by this user; a live pid (ESRCH says dead, anything
 * else says alive or not ours) keeps its socket. Call before binding.
 */
export function sweepStaleSockets(runtimeDir: string): void {
    let entries: string[];
    try {
        entries = fs.readdirSync(runtimeDir);
    } catch {
        return;
    }
    const uid = currentUid();
    for (const name of entries) {
        const match = SOCKET_FILE_PATTERN.exec(name);
        if (!match || match[1] === String(process.pid)) {
            continue;
        }
        const stalePath = path.join(runtimeDir, name);
        let stats: fs.Stats | undefined;
        try {
            stats = fs.lstatSync(stalePath);
        } catch {
            continue;
        }
        if (!stats.isSocket()) {
            continue;
        }
        if (uid !== null && stats.uid !== uid) {
            continue;
        }
        const stalePid = Number(match[1]);
        try {
            process.kill(stalePid, 0);
            continue; // Alive: not ours to remove.
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
                continue; // Alive but not ours, or inconclusive: keep.
            }
        }
        try {
            fs.unlinkSync(stalePath);
        } catch {
            // Already gone.
        }
    }
}
