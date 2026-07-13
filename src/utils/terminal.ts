import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Get package version
// __PACKAGE_VERSION__ will be replaced at build time
const PACKAGE_VERSION = '__PACKAGE_VERSION__';

export function getPackageVersion(): string {
    // If we have the build-time replaced version, use it (check if it looks like a version)
    if (/^\d+\.\d+\.\d+/.test(PACKAGE_VERSION)) {
        return PACKAGE_VERSION;
    }

    // Fallback for development mode
    const possiblePaths = [
        path.join(__dirname, '..', '..', 'package.json'), // Development: dist/utils/ -> root
        path.join(__dirname, '..', 'package.json')       // Production: dist/ -> root (bundled)
    ];

    for (const packageJsonPath of possiblePaths) {
        try {
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
                return packageJson.version ?? '';
            }
        } catch {
            // Continue to next path
        }
    }

    return '';
}

function probeTerminalWidth(): number | null {
    // Explicit override. Useful when ccstatusline is spawned in a context where
    // no ancestor process owns a TTY at all — e.g. some Claude Code >= 2.1.139
    // spawn paths, IDE integrations, or nested-shell scenarios where both the
    // ancestor-walk probe and `tput cols` return nothing usable. Users can set
    // CCSTATUSLINE_WIDTH on the statusLine command (e.g.
    // `CCSTATUSLINE_WIDTH=200 ccstatusline ...`) to bypass probing entirely.
    const overrideRaw = process.env.CCSTATUSLINE_WIDTH;
    if (overrideRaw) {
        const override = parsePositiveInteger(overrideRaw);
        if (override !== null) {
            return override;
        }
    }

    // Preserve historical behavior on Windows: width detection is unavailable.
    // This avoids Unix fallback command behavior (e.g. 2>/dev/null) on Windows.
    if (process.platform === 'win32') {
        return null;
    }

    // Claude Code can spawn ccstatusline with piped stdio, leaving the immediate
    // parent process without a controlling TTY. Walk up a few ancestors until we
    // find the shell process that owns the real PTY.
    let pid = process.pid;
    for (let depth = 0; depth < 8; depth += 1) {
        const parentPid = getParentProcessId(pid);
        if (parentPid === null) {
            break;
        }

        pid = parentPid;

        const tty = getTTYForProcess(pid);
        if (tty === null) {
            continue;
        }

        const width = getWidthForTTY(tty);
        if (width !== null) {
            return width;
        }
    }

    // Fallback: try tput cols which might work in some environments
    try {
        const width = execFileSync('tput', ['cols'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        }).trim();

        return parsePositiveInteger(width);
    } catch {
        // tput also failed
    }

    return null;
}

function parsePositiveInteger(value: string): number | null {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function getParentProcessId(pid: number): number | null {
    try {
        const parentPidOutput = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        }).trim();

        return parsePositiveInteger(parentPidOutput);
    } catch {
        return null;
    }
}

function getTTYForProcess(pid: number): string | null {
    try {
        const tty = execFileSync('ps', ['-o', 'tty=', '-p', String(pid)], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        }).replace(/\s+/g, '');

        if (!tty || tty === '??' || tty === '?') {
            return null;
        }

        return tty;
    } catch {
        return null;
    }
}

function getWidthForTTY(tty: string): number | null {
    // The shell-redirect form (`stty size < /dev/${tty}`) fails with ENOTTY
    // when the calling process has no controlling terminal — the case under
    // Claude Code >= 2.1.139, which spawns statusline/hooks without terminal
    // access. `stty -F` / `-f` ask stty to open the device itself (with
    // O_NOCTTY semantics) and succeed regardless of controlling-tty status,
    // so the legacy redirect form (which also required a shell) is dropped.
    // The "rows cols" output is parsed here rather than piped through awk:
    // no shell, one process instead of three.
    const devicePath = `/dev/${tty}`;
    const attempts: string[][] = [
        ['-F', devicePath, 'size'],   // GNU coreutils (Linux)
        ['-f', devicePath, 'size']    // BSD stty (macOS, *BSD)
    ];

    for (const args of attempts) {
        try {
            const output = execFileSync('stty', args, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                windowsHide: true
            }).trim();

            const parsed = parsePositiveInteger(output.split(/\s+/)[1] ?? '');
            if (parsed !== null) {
                return parsed;
            }
        } catch {
            // try next strategy
        }
    }

    return null;
}

// Memoized probe result. `hasProbed` is a separate flag rather than a
// `null`-check on `cachedWidth`, because `null` (no TTY found) is a real,
// cacheable answer -- and the common one: Claude Code spawns the statusline
// with no controlling terminal. Callers do `context.terminalWidth ??
// getTerminalWidth()`, so treating `null` as "not yet probed" would re-run the
// full ancestor walk on every line of every render.
let hasProbed = false;
let cachedWidth: number | null = null;

/** Clear the memoized width. For tests, and for the TUI to re-probe after a resize. */
export function resetTerminalWidthCache(): void {
    hasProbed = false;
    cachedWidth = null;
}

// Get terminal width
export function getTerminalWidth(): number | null {
    if (!hasProbed) {
        cachedWidth = probeTerminalWidth();
        hasProbed = true;
    }

    return cachedWidth;
}

// Check if terminal width detection is available
export function canDetectTerminalWidth(): boolean {
    return getTerminalWidth() !== null;
}
