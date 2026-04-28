import { execSync } from 'child_process';
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
