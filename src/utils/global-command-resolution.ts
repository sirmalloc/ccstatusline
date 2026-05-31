import { execFileSync } from 'child_process';
import * as path from 'path';

import { getPackageManagerExecutable } from './package-manager-executable';

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

function isTransientBunxStatusLinePath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');

    return /(?:^|\/)bunx-[^/]*ccstatusline@[^/]+\/node_modules\/\.bin\/ccstatusline(?:\.(?:cmd|ps1))?$/i.test(normalized);
}

export function getPersistentCommandResolutionPaths(paths: string[]): string[] {
    return paths.filter(path => !isTransientBunxStatusLinePath(path));
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
                windowsHide: true
            })
            : execFileSync('which', ['-a', command], {
                encoding: 'utf-8',
                timeout: COMMAND_LOOKUP_TIMEOUT_MS,
                windowsHide: true
            });

        return splitCommandOutput(output);
    } catch {
        return [];
    }
}

function getNpmGlobalBinDir(platform: NodeJS.Platform): string | null {
    try {
        const prefix = execFileSync(getPackageManagerExecutable('npm', platform), ['prefix', '-g'], {
            encoding: 'utf-8',
            timeout: COMMAND_LOOKUP_TIMEOUT_MS,
            windowsHide: true
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
        const binDir = execFileSync('bun', ['pm', 'bin', '-g'], {
            encoding: 'utf-8',
            timeout: COMMAND_LOOKUP_TIMEOUT_MS,
            windowsHide: true
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

function getUniqueResolvedDirs(resolvedPaths: string[]): string[] {
    const seen = new Set<string>();
    const dirs: string[] = [];

    for (const resolvedPath of resolvedPaths) {
        const dir = getDirectoryName(resolvedPath);
        const comparableDir = normalizePathForComparison(dir);
        if (seen.has(comparableDir)) {
            continue;
        }

        seen.add(comparableDir);
        dirs.push(dir);
    }

    return dirs;
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

    const resolvedDirs = getUniqueResolvedDirs(resolvedPaths);
    if (resolvedDirs.length > 1) {
        return `⚠ Multiple ccstatusline binaries are on PATH. Claude Code will run the first match: ${firstResolvedPath}.\nOther matches: ${formatPathList(resolvedPaths.slice(1))}`;
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
