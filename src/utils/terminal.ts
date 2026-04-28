import {
    execSync,
    spawnSync
} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
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

// Locate the probe script on disk. Prod: copied alongside the bundle by
// the build command. Dev (`bun run src/...`): read from scripts/.
let cachedWindowsWidthProbeScript: string | null = null;

function getWindowsWidthProbeScript(): string {
    if (cachedWindowsWidthProbeScript !== null) {
        return cachedWindowsWidthProbeScript;
    }
    const candidates = [
        path.join(__dirname, 'windows-width-probe.ps1'),                             // prod: dist/
        path.join(__dirname, '..', '..', 'scripts', 'windows-width-probe.ps1')       // dev: scripts/
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            cachedWindowsWidthProbeScript = fs.readFileSync(p, 'utf8');
            return cachedWindowsWidthProbeScript;
        }
    }
    throw new Error('windows-width-probe.ps1 not found');
}

function probeTerminalWidth(): number | null {
    if (process.platform === 'win32') {
        if (process.stdout.isTTY
            && typeof process.stdout.columns === 'number'
            && process.stdout.columns > 0) {
            // Fast path: when ccstatusline runs interactively, skip the probe
            return process.stdout.columns;
        }
        return probeTerminalWidthWindows();
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
        const width = execSync('tput cols 2>/dev/null', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        return parsePositiveInteger(width);
    } catch {
        // tput also failed
    }

    return null;
}

// PowerShell cold start + Add-Type JIT is ~3–5s on first run. Cache for 60s
// so every refresh within Claude Code's refreshInterval range (1–60s) hits
// cache; resizes go stale for up to this TTL before the probe refreshes.
const WINDOWS_WIDTH_CACHE_TTL_MS = 60_000;

// Keyed on parent PID (claude.exe) so separate Claude Code windows don't
// clobber each other's cache.
function getWindowsWidthCachePath(ancestorPid: number): string {
    return path.join(os.tmpdir(), `ccstatusline-win-width-${ancestorPid}.json`);
}

function readWindowsWidthCache(ancestorPid: number): number | null {
    try {
        const cachePath = getWindowsWidthCachePath(ancestorPid);
        const raw = fs.readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(raw) as { width?: unknown; cachedAt?: unknown };
        if (typeof parsed.width !== 'number' || typeof parsed.cachedAt !== 'number') {
            return null;
        }
        if (Date.now() - parsed.cachedAt > WINDOWS_WIDTH_CACHE_TTL_MS) {
            return null;
        }
        return parsed.width > 0 ? parsed.width : null;
    } catch {
        return null;
    }
}

function writeWindowsWidthCache(ancestorPid: number, width: number): void {
    try {
        fs.writeFileSync(
            getWindowsWidthCachePath(ancestorPid),
            JSON.stringify({ width, cachedAt: Date.now() }),
            'utf8'
        );
    } catch {
        // Cache is a nice-to-have; silently drop write failures.
    }
}

function probeTerminalWidthWindows(): number | null {
    // Claude Code pipes our stdio, so process.stdout.columns is undefined.
    // Walk ancestors and read claude.exe's console width via PowerShell.
    // See scripts/windows-width-probe.ps1. ppid is stable for the session
    // (unlike our pid, which changes every tick) so we cache on it.
    const cacheKey = process.ppid;
    if (!cacheKey || cacheKey <= 0) {
        return null;
    }
    const cached = readWindowsWidthCache(cacheKey);
    if (cached !== null) {
        return cached;
    }

    try {
        // -EncodedCommand avoids quoting a multi-line script on a Windows
        // command line. spawnSync (not execSync) reaches powershell.exe
        // directly; cmd.exe mangles args at the sizes we pass.
        const encoded = Buffer.from(getWindowsWidthProbeScript(), 'utf16le').toString('base64');
        const result = spawnSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
            {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10000,
                windowsHide: true
            }
        );

        if (result.status !== 0) {
            return null;
        }

        const width = parsePositiveInteger(result.stdout.trim());
        if (width !== null) {
            writeWindowsWidthCache(cacheKey, width);
        }
        return width;
    } catch {
        return null;
    }
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
        const parentPidOutput = execSync(`ps -o ppid= -p ${pid}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            shell: '/bin/sh'
        }).trim();

        return parsePositiveInteger(parentPidOutput);
    } catch {
        return null;
    }
}

function getTTYForProcess(pid: number): string | null {
    try {
        const tty = execSync(`ps -o tty= -p ${pid}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            shell: '/bin/sh'
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
    try {
        const width = execSync(
            `stty size < /dev/${tty} | awk '{print $2}'`,
            {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                shell: '/bin/sh'
            }
        ).trim();

        return parsePositiveInteger(width);
    } catch {
        return null;
    }
}

// Get terminal width
export function getTerminalWidth(): number | null {
    return probeTerminalWidth();
}

// Check if terminal width detection is available
export function canDetectTerminalWidth(): boolean {
    return probeTerminalWidth() !== null;
}
