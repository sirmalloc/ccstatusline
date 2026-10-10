import * as fs from 'node:fs';
import * as tty from 'node:tty';

const MAX_ANCESTOR_DEPTH = 8;
const STDIO_FDS = [0, 1, 2] as const;

export interface NativeProbeDeps {
    readFileSync: (path: string) => string;
    readlinkSync: (path: string) => string;
    openSync: (path: string, flags: number) => number;
    closeSync: (fd: number) => void;
    isatty: (fd: number) => boolean;
    getColumns: (fd: number) => number | null;
    platform: string;
}

const defaultDeps: NativeProbeDeps = {
    readFileSync: (path: string) => fs.readFileSync(path, 'utf-8'),
    readlinkSync: (path: string) => fs.readlinkSync(path, 'utf-8'),
    openSync: (path: string, flags: number) => fs.openSync(path, flags),
    closeSync: (fd: number) => { fs.closeSync(fd); },
    isatty: (fd: number) => tty.isatty(fd),
    getColumns: (fd: number) => {
        // tty.WriteStream reads the window size via TIOCGWINSZ. No subprocess.
        const stream = new tty.WriteStream(fd);
        const columns = stream.columns;
        return typeof columns === 'number' && columns > 0 ? columns : null;
    },
    // Read at call time, not module-load time: tests pin process.platform per
    // case, and a snapshot taken at import would ignore the pin.
    get platform(): string {
        return process.platform;
    }
};

/**
 * Parse the ppid (field 4) out of a /proc/<pid>/stat line.
 * The comm field (2) is wrapped in parens and may itself contain spaces and
 * parens, so fields must be read after the LAST ')'.
 */
export function parsePpidFromStat(stat: string): number | null {
    const commEnd = stat.lastIndexOf(')');
    if (commEnd === -1) {
        return null;
    }

    // After "(comm)" the remaining fields are: state, ppid, ...
    const fields = stat.slice(commEnd + 1).trim().split(/\s+/);
    const ppid = Number.parseInt(fields[1] ?? '', 10);
    if (Number.isNaN(ppid) || ppid <= 0) {
        return null;
    }

    return ppid;
}

/**
 * Parse tty_nr (field 7) out of a /proc/<pid>/stat line: the controlling
 * terminal's device number, 0 when the process has none. This is the value
 * `ps -o tty=` renders, printing "?" for 0.
 */
export function parseTtyNrFromStat(stat: string): number | null {
    const commEnd = stat.lastIndexOf(')');
    if (commEnd === -1) {
        return null;
    }

    // After "(comm)": state, ppid, pgrp, session, tty_nr, ...
    const fields = stat.slice(commEnd + 1).trim().split(/\s+/);
    const ttyNr = Number.parseInt(fields[4] ?? '', 10);
    return Number.isNaN(ttyNr) ? null : ttyNr;
}

function readStat(pid: number, deps: NativeProbeDeps): string | null {
    try {
        return deps.readFileSync(`/proc/${pid}/stat`);
    } catch {
        return null;
    }
}

function hasNoControllingTTY(pid: number, deps: NativeProbeDeps): boolean {
    const stat = readStat(pid, deps);
    return stat !== null && parseTtyNrFromStat(stat) === 0;
}

function findTTYDevice(pid: number, deps: NativeProbeDeps): string | null {
    for (const fd of STDIO_FDS) {
        try {
            const target = deps.readlinkSync(`/proc/${pid}/fd/${fd}`);
            if (target.startsWith('/dev/pts/') || target.startsWith('/dev/tty')) {
                return target;
            }
        } catch {
            // fd missing or not readable; try the next one
        }
    }

    return null;
}

function widthOfDevice(device: string, deps: NativeProbeDeps): number | null {
    let fd: number | null = null;
    try {
        // O_NOCTTY: never adopt this device as our controlling terminal.
        fd = deps.openSync(device, fs.constants.O_RDONLY | fs.constants.O_NOCTTY);
        if (!deps.isatty(fd)) {
            return null;
        }

        return deps.getColumns(fd);
    } catch {
        return null;
    } finally {
        if (fd !== null) {
            try {
                deps.closeSync(fd);
            } catch {
                // best-effort
            }
        }
    }
}

export interface NativeProbeResult {
    width: number | null;
    /**
     * True only when the walk read /proc/<pid>/stat for every ancestor the
     * portable `ps` walk would visit (up to MAX_ANCESTOR_DEPTH, including pid 1)
     * and none of them has a controlling terminal. `ps -o tty=` would then print
     * "?" for each of them and no `stty` would ever run, so that walk can be
     * skipped without changing the result.
     */
    noControllingTTY: boolean;
}

/**
 * Probe terminal width with zero subprocesses, using /proc and TIOCGWINSZ.
 * Linux only; anywhere else the result is inconclusive so the caller falls
 * back to the portable ps/stty path.
 */
export function probeTerminalNative(deps: NativeProbeDeps = defaultDeps): NativeProbeResult {
    const inconclusive: NativeProbeResult = { width: null, noControllingTTY: false };
    if (deps.platform !== 'linux') {
        return inconclusive;
    }

    let sawControllingTTY = false;
    let pid = process.pid;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth += 1) {
        const stat = readStat(pid, deps);
        if (stat === null) {
            return inconclusive;
        }

        // `pid` is the ancestor visited in the previous iteration (not ourselves).
        if (depth > 0 && parseTtyNrFromStat(stat) !== 0) {
            sawControllingTTY = true;
        }

        const parentPid = parsePpidFromStat(stat);
        if (parentPid === null) {
            return inconclusive;
        }

        if (parentPid <= 1) {
            // The ps walk stops here too, after also querying pid 1's tty.
            return { width: null, noControllingTTY: !sawControllingTTY && hasNoControllingTTY(1, deps) };
        }

        pid = parentPid;

        const device = findTTYDevice(pid, deps);
        if (device === null) {
            continue;
        }

        const width = widthOfDevice(device, deps);
        if (width !== null) {
            return { width, noControllingTTY: false };
        }
    }

    // Depth limit reached: the last ancestor visited has not had its stat read yet.
    return { width: null, noControllingTTY: !sawControllingTTY && hasNoControllingTTY(pid, deps) };
}

/** Width-only view of probeTerminalNative. */
export function probeWidthNative(deps: NativeProbeDeps = defaultDeps): number | null {
    return probeTerminalNative(deps).width;
}
