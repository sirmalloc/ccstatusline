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

function probeTerminalWidth(): number | null {
    // On Windows, the claude.exe process owns the real ConPTY that knows the
    // terminal size. ccstatusline is spawned by claude.exe with piped stdio, so
    // it has no console of its own — we walk up the PPID chain, AttachConsole
    // to an ancestor (preferring claude.exe), and ask `mode con` for the width.
    if (process.platform === 'win32') {
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

// PowerShell script that walks the PPID chain via a single toolhelp32 snapshot
// (native, fast) and asks each ancestor's console for its width via
// AttachConsole + `mode con`. Prefers the claude.exe ancestor — it owns the
// real ConPTY tied to the host terminal — falling back to the widest
// successful read. Emits a positive integer on stdout when found, else nothing.
const WINDOWS_WIDTH_PROBE_SCRIPT = `$ErrorActionPreference='SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NP {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
    public struct PROCESSENTRY32 {
        public uint dwSize; public uint cntUsage; public uint th32ProcessID;
        public IntPtr th32DefaultHeapID; public uint th32ModuleID; public uint cntThreads;
        public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szExeFile;
    }
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto)] public static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto)] public static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr hObject);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint dwProcessId);
    [DllImport("kernel32.dll")] public static extern bool FreeConsole();
}
"@
$snap = [NP]::CreateToolhelp32Snapshot(2, 0)
$entry = New-Object NP+PROCESSENTRY32
$entry.dwSize = [System.Runtime.InteropServices.Marshal]::SizeOf($entry)
$byPid = @{}
if ([NP]::Process32First($snap, [ref]$entry)) {
    do { $byPid[[int]$entry.th32ProcessID] = @{ ppid = [int]$entry.th32ParentProcessID; name = $entry.szExeFile } } while ([NP]::Process32Next($snap, [ref]$entry))
}
[NP]::CloseHandle($snap) | Out-Null
$claudeW = 0
$maxW = 0
$cur = $PID
for ($i = 0; $i -lt 12; $i++) {
    $p = $byPid[[int]$cur]
    if ($null -eq $p) { break }
    if ($cur -ne $PID) {
        [NP]::FreeConsole() | Out-Null
        if ([NP]::AttachConsole($cur)) {
            $m = cmd /c mode con 2>$null
            $line = $m | Where-Object { $_ -match 'Columns' } | Select-Object -First 1
            if ($line -match '(\\d+)') {
                $w = [int]$Matches[1]
                if ($w -gt $maxW) { $maxW = $w }
                if ($p.name -ieq 'claude.exe' -or $p.name -ieq 'claude') { $claudeW = $w }
            }
            [NP]::FreeConsole() | Out-Null
        }
    }
    $cur = $p.ppid
    if ($cur -eq 0) { break }
}
if ($claudeW -gt 0) { Write-Output $claudeW } elseif ($maxW -gt 0) { Write-Output $maxW }`;

// The probe spawns PowerShell (cold start + Add-Type JIT ≈ 3–5s on first run),
// which is too slow for every status-line tick. Cache the result briefly so we
// only pay the cost once per minute. Users who resize the terminal will see
// stale width for up to WINDOWS_WIDTH_CACHE_TTL_MS before the probe refreshes.
const WINDOWS_WIDTH_CACHE_TTL_MS = 60 * 1000;

function getWindowsWidthCachePath(): string {
    return path.join(os.tmpdir(), 'ccstatusline-win-width-cache.json');
}

function readWindowsWidthCache(): number | null {
    try {
        const cachePath = getWindowsWidthCachePath();
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

function writeWindowsWidthCache(width: number): void {
    try {
        fs.writeFileSync(
            getWindowsWidthCachePath(),
            JSON.stringify({ width, cachedAt: Date.now() }),
            'utf8'
        );
    } catch {
        // Cache is a nice-to-have; silently drop write failures.
    }
}

function probeTerminalWidthWindows(): number | null {
    const cached = readWindowsWidthCache();
    if (cached !== null) {
        return cached;
    }

    try {
        // PowerShell -EncodedCommand expects a UTF-16LE base64 string. Using
        // it sidesteps all the quoting headaches of passing multi-line script
        // text through a Windows command line. spawnSync (not execSync) is
        // used so the args reach powershell.exe directly, bypassing cmd.exe —
        // cmd's argument handling and output buffering eat the result at the
        // sizes our encoded command reaches.
        const encoded = Buffer.from(WINDOWS_WIDTH_PROBE_SCRIPT, 'utf16le').toString('base64');
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
            writeWindowsWidthCache(width);
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