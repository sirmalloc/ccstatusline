import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { findAllOnPosixPath } from './executable-path';
import {
    getPackageManagerExecutable,
    getPackageManagerShellOptions
} from './package-manager-executable';

export type GlobalPackageManager = 'npm' | 'bun';

interface ExecOptions { platform?: NodeJS.Platform }

export interface GlobalCommandResolution {
    resolvedPaths: string[];
    firstResolvedPath: string | null;
    expectedBinDir: string | null;
    warning: string | null;
}

const COMMAND_LOOKUP_TIMEOUT_MS = 5000;

function splitCommandOutput(output: string): string[] {
    const seen = new Set<string>();
    const paths: string[] = [];

    for (const line of output.split(/\r?\n/)) {
        const candidate = line.trim();
        if (!candidate || seen.has(candidate)) {
            continue;
        }

        seen.add(candidate);
        paths.push(candidate);
    }

    return paths;
}

// While bunx or npx runs the TUI, the bin dir of its temporary copy comes first
// on PATH, ahead of any persistent install:
// - bunx: <temp dir>/bunx-<uid>-ccstatusline@<tag>/node_modules/.bin
// - npx: <npm cache>/_npx/<hash>/node_modules/.bin, wherever the npm cache lives
const TRANSIENT_STATUS_LINE_PATH_PATTERNS = [
    /(?:^|\/)bunx-[^/]*ccstatusline@[^/]+\/node_modules\/\.bin\/ccstatusline(?:\.(?:cmd|ps1))?$/i,
    /(?:^|\/)_npx\/[^/]+\/node_modules\/\.bin\/ccstatusline(?:\.(?:cmd|ps1))?$/i
];

function isTransientStatusLinePath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');

    return TRANSIENT_STATUS_LINE_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

export function getPersistentCommandResolutionPaths(paths: string[]): string[] {
    return paths.filter(path => !isTransientStatusLinePath(path));
}

export function getCommandResolutionPaths(
    command: string,
    { platform = process.platform }: ExecOptions = {}
): string[] {
    try {
        const output = platform === 'win32'
            ? execFileSync('where', [command], {
                encoding: 'utf-8',
                timeout: COMMAND_LOOKUP_TIMEOUT_MS,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore']
            })
            : execFileSync('which', ['-a', command], {
                encoding: 'utf-8',
                timeout: COMMAND_LOOKUP_TIMEOUT_MS,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore']
            });

        return splitCommandOutput(output);
    } catch (error) {
        // No `which` to ask: list what it would from PATH
        return platform !== 'win32' && (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? findAllOnPosixPath(command)
            : [];
    }
}

function getNpmGlobalBinDir(platform: NodeJS.Platform): string | null {
    try {
        const executable = getPackageManagerExecutable('npm', platform);
        const prefix = execFileSync(executable, ['prefix', '-g'], {
            encoding: 'utf-8',
            timeout: COMMAND_LOOKUP_TIMEOUT_MS,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
            ...getPackageManagerShellOptions(executable, platform)
        }).trim();

        if (!prefix) {
            return null;
        }

        return platform === 'win32' || /^[a-z]:[\\/]/i.test(prefix)
            ? prefix
            : path.join(prefix, 'bin');
    } catch {
        return null;
    }
}

function getBunGlobalBinDir(): string | null {
    try {
        // bun writes an error to stderr when its global dir was never
        // initialized (no `bun add -g` ever run); silence it so best-effort
        // probing cannot leak into the TUI terminal.
        const binDir = execFileSync('bun', ['pm', 'bin', '-g'], {
            encoding: 'utf-8',
            timeout: COMMAND_LOOKUP_TIMEOUT_MS,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();

        return binDir || null;
    } catch {
        return null;
    }
}

export function getExpectedGlobalBinDir(
    packageManager: GlobalPackageManager,
    { platform = process.platform }: ExecOptions = {}
): string | null {
    return packageManager === 'npm'
        ? getNpmGlobalBinDir(platform)
        : getBunGlobalBinDir();
}

function trimTrailingSlashes(value: string): string {
    if (/^[a-z]:\/$/i.test(value) || value === '/') {
        return value;
    }

    return value.replace(/\/+$/, '');
}

function normalizePathForComparison(filePath: string): string {
    const normalized = trimTrailingSlashes(filePath.trim().replace(/\\/g, '/'));

    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/mnt/')
        ? normalized.toLowerCase()
        : normalized;
}

export function getPathComparisonVariants(filePath: string): string[] {
    const normalized = normalizePathForComparison(filePath);
    const variants = new Set([normalized]);

    const driveMatch = /^([a-z]):\/(.*)$/i.exec(normalized);
    if (driveMatch) {
        variants.add(`/mnt/${driveMatch[1]?.toLowerCase()}/${driveMatch[2] ?? ''}`);
    }

    const wslMountMatch = /^\/mnt\/([a-z])\/(.*)$/i.exec(normalized);
    if (wslMountMatch) {
        variants.add(`${wslMountMatch[1]?.toLowerCase()}:/${wslMountMatch[2] ?? ''}`);
    }

    return Array.from(variants);
}

function getDirectoryName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlashIndex = normalized.lastIndexOf('/');

    return lastSlashIndex === -1
        ? ''
        : normalized.slice(0, lastSlashIndex);
}

// A directory with symlinks resolved, so two spellings of one, such as /bin and
// /usr/bin where /bin links to usr/bin (merged /usr), count as one install
// location. The path as given when it can't be resolved. The native call also
// returns the letter case on disk where case is ignored (macOS), as Bun's
// realpathSync does but Node's doesn't, so both runtimes count .../Bin and
// .../bin as one.
export function getRealDirectory(dir: string): string {
    try {
        return fs.realpathSync.native(dir);
    } catch {
        return dir;
    }
}

// The first listed path in each directory, comparing directories with symlinks
// resolved: one path per install, starting with the first match
function getOnePathPerDirectory(resolvedPaths: string[]): string[] {
    const seen = new Set<string>();
    const paths: string[] = [];

    for (const resolvedPath of resolvedPaths) {
        const comparableDir = normalizePathForComparison(getRealDirectory(getDirectoryName(resolvedPath)));
        if (seen.has(comparableDir)) {
            continue;
        }

        seen.add(comparableDir);
        paths.push(resolvedPath);
    }

    return paths;
}

export function isPathInsideDir(filePath: string, dir: string): boolean {
    const pathVariants = getPathComparisonVariants(filePath);
    const dirVariants = getPathComparisonVariants(dir);

    return pathVariants.some(pathVariant => dirVariants.some((dirVariant) => {
        const withSlash = dirVariant.endsWith('/') ? dirVariant : `${dirVariant}/`;
        return pathVariant === dirVariant || pathVariant.startsWith(withSlash);
    }));
}

function formatPathList(paths: string[]): string {
    return paths.join(', ');
}

function getResolutionWarning(
    packageManager: GlobalPackageManager,
    resolvedPaths: string[],
    expectedBinDir: string | null
): string | null {
    const firstResolvedPath = resolvedPaths[0] ?? null;

    if (!firstResolvedPath) {
        return '⚠ ccstatusline is not currently resolvable on PATH. Claude Code runs ccstatusline, so restart your shell or update PATH if it cannot launch.';
    }

    const installPaths = getOnePathPerDirectory(resolvedPaths);
    if (installPaths.length > 1) {
        return `⚠ Multiple ccstatusline binaries are on PATH. Claude Code will run the first match: ${firstResolvedPath}.\nOther matches: ${formatPathList(installPaths.slice(1))}`;
    }

    if (expectedBinDir && !isPathInsideDir(firstResolvedPath, expectedBinDir)) {
        return `⚠ ccstatusline resolves to ${firstResolvedPath}, which is outside the ${packageManager} global bin directory (${expectedBinDir}). Claude Code will run the first PATH match.`;
    }

    return null;
}

export function inspectGlobalCommandResolution(
    packageManager: GlobalPackageManager,
    options: ExecOptions = {}
): GlobalCommandResolution {
    const resolvedPaths = getPersistentCommandResolutionPaths(getCommandResolutionPaths('ccstatusline', options));
    const expectedBinDir = getExpectedGlobalBinDir(packageManager, options);

    return {
        resolvedPaths,
        firstResolvedPath: resolvedPaths[0] ?? null,
        expectedBinDir,
        warning: getResolutionWarning(packageManager, resolvedPaths, expectedBinDir)
    };
}
