import {
    execFile,
    execFileSync
} from 'child_process';
import * as fs from 'fs';

import type { PackageCommandAvailability } from './claude-settings';
import {
    getCommandResolutionPaths,
    getExpectedGlobalBinDir,
    getPersistentCommandResolutionPaths,
    isPathInsideDir,
    type GlobalPackageManager
} from './global-command-resolution';
import { getPackageManagerExecutable } from './package-manager-executable';

export type { GlobalPackageManager };

export interface GlobalPackageInstallation {
    packageManager: GlobalPackageManager;
    available: boolean;
    installed: boolean;
    binDir: string | null;
}

export interface ActiveGlobalCommandResolution {
    packageManager: GlobalPackageManager | 'unknown';
    resolvedPath: string | null;
    resolvedPaths: string[];
    binDir: string | null;
    version: string | null;
    warning: string | null;
}

export interface InspectGlobalPackageInstallationsOptions {
    commandAvailability: Pick<PackageCommandAvailability, 'npm' | 'bun'>;
    platform?: NodeJS.Platform;
}

export interface InspectActiveGlobalCommandOptions {
    commandAvailability: Pick<PackageCommandAvailability, 'npm' | 'bun'>;
    platform?: NodeJS.Platform;
}

export interface RunGlobalPackageUninstallOptions { platform?: NodeJS.Platform }

const GLOBAL_PACKAGE_TIMEOUT_MS = 120000;
const VERSION_LOOKUP_TIMEOUT_MS = 5000;
const WINDOWS_SHIM_EXTENSIONS = [
    '',
    '.cmd',
    '.ps1'
];

function isWindowsStylePath(filePath: string): boolean {
    return /^[a-z]:[\\/]/i.test(filePath);
}

function trimTrailingSeparators(filePath: string): string {
    return filePath.replace(/[\\/]+$/, '');
}

function appendPathSegment(dir: string, segment: string): string {
    const separator = dir.includes('\\') && !dir.includes('/')
        ? '\\'
        : '/';

    return `${trimTrailingSeparators(dir)}${separator}${segment}`;
}

function toWindowsPath(filePath: string): string | null {
    const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(filePath.replace(/\\/g, '/'));
    if (!match) {
        return null;
    }

    return `${match[1]?.toUpperCase()}:\\${(match[2] ?? '').replace(/\//g, '\\')}`;
}

function toWslPath(filePath: string): string | null {
    const match = /^([a-z]):[\\/](.*)$/i.exec(filePath);
    if (!match) {
        return null;
    }

    return `/mnt/${match[1]?.toLowerCase()}/${(match[2] ?? '').replace(/\\/g, '/')}`;
}

function getFilesystemPathVariants(filePath: string): string[] {
    const variants = new Set<string>([filePath]);
    const windowsPath = toWindowsPath(filePath);
    const wslPath = toWslPath(filePath);

    if (windowsPath) {
        variants.add(windowsPath);
    }

    if (wslPath) {
        variants.add(wslPath);
    }

    return Array.from(variants);
}

function getBinaryPathCandidates(binDir: string, platform: NodeJS.Platform): string[] {
    const extensions = platform === 'win32' || isWindowsStylePath(binDir)
        ? WINDOWS_SHIM_EXTENSIONS
        : [''];

    return extensions.map(extension => appendPathSegment(binDir, `ccstatusline${extension}`));
}

function hasBinaryOnDisk(binDir: string, platform: NodeJS.Platform): boolean {
    return getBinaryPathCandidates(binDir, platform)
        .some(candidate => getFilesystemPathVariants(candidate).some(variant => fs.existsSync(variant)));
}

function hasResolvedBinaryInDir(resolvedPaths: string[], binDir: string): boolean {
    return resolvedPaths.some(resolvedPath => isPathInsideDir(resolvedPath, binDir));
}

function getDirectoryName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlashIndex = normalized.lastIndexOf('/');

    return lastSlashIndex === -1
        ? ''
        : normalized.slice(0, lastSlashIndex);
}

function getComparablePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

function getUniqueResolvedDirs(resolvedPaths: string[]): string[] {
    const seen = new Set<string>();
    const dirs: string[] = [];

    for (const resolvedPath of resolvedPaths) {
        const dir = getDirectoryName(resolvedPath);
        const comparableDir = getComparablePath(dir);
        if (seen.has(comparableDir)) {
            continue;
        }

        seen.add(comparableDir);
        dirs.push(dir);
    }

    return dirs;
}

function formatPathList(paths: string[]): string {
    return paths.join(', ');
}

function readPackageVersion(packageJsonPath: string): string | null {
    for (const variant of getFilesystemPathVariants(packageJsonPath)) {
        try {
            if (!fs.existsSync(variant)) {
                continue;
            }

            const packageJson = JSON.parse(fs.readFileSync(variant, 'utf-8')) as { version?: unknown };
            return typeof packageJson.version === 'string'
                ? packageJson.version
                : null;
        } catch {
            return null;
        }
    }

    return null;
}

function getNpmGlobalPackageVersion(platform: NodeJS.Platform): string | null {
    try {
        const rootDir = execFileSync(getPackageManagerExecutable('npm', platform), ['root', '-g'], {
            encoding: 'utf-8',
            timeout: VERSION_LOOKUP_TIMEOUT_MS,
            windowsHide: true
        }).trim();

        return rootDir
            ? readPackageVersion(appendPathSegment(appendPathSegment(rootDir, 'ccstatusline'), 'package.json'))
            : null;
    } catch {
        return null;
    }
}

function getBunInstallRoot(binDir: string): string {
    const normalized = trimTrailingSeparators(binDir.replace(/\\/g, '/'));
    const lower = normalized.toLowerCase();

    return lower.endsWith('/bin')
        ? normalized.slice(0, -4)
        : normalized;
}

function getBunGlobalPackageVersion(binDir: string | null): string | null {
    if (!binDir) {
        return null;
    }

    return readPackageVersion(
        appendPathSegment(
            appendPathSegment(
                appendPathSegment(
                    appendPathSegment(
                        appendPathSegment(getBunInstallRoot(binDir), 'install'),
                        'global'
                    ),
                    'node_modules'
                ),
                'ccstatusline'
            ),
            'package.json'
        )
    );
}

function getGlobalPackageVersion(
    packageManager: GlobalPackageManager | 'unknown',
    binDir: string | null,
    platform: NodeJS.Platform
): string | null {
    if (packageManager === 'npm') {
        return getNpmGlobalPackageVersion(platform);
    }

    if (packageManager === 'bun') {
        return getBunGlobalPackageVersion(binDir);
    }

    return null;
}

function inspectPackageManager(
    packageManager: GlobalPackageManager,
    available: boolean,
    resolvedPaths: string[],
    platform: NodeJS.Platform
): GlobalPackageInstallation {
    const binDir = available
        ? getExpectedGlobalBinDir(packageManager, { platform })
        : null;

    return {
        packageManager,
        available,
        installed: !!binDir && (hasBinaryOnDisk(binDir, platform) || hasResolvedBinaryInDir(resolvedPaths, binDir)),
        binDir
    };
}

function getManagerBinDir(
    packageManager: GlobalPackageManager,
    available: boolean,
    platform: NodeJS.Platform
): string | null {
    return available
        ? getExpectedGlobalBinDir(packageManager, { platform })
        : null;
}

function getActivePackageManager(
    resolvedPath: string,
    managerBins: Record<GlobalPackageManager, string | null>
): Pick<ActiveGlobalCommandResolution, 'packageManager' | 'binDir'> {
    if (managerBins.bun && isPathInsideDir(resolvedPath, managerBins.bun)) {
        return {
            packageManager: 'bun',
            binDir: managerBins.bun
        };
    }

    if (managerBins.npm && isPathInsideDir(resolvedPath, managerBins.npm)) {
        return {
            packageManager: 'npm',
            binDir: managerBins.npm
        };
    }

    return {
        packageManager: 'unknown',
        binDir: null
    };
}

function getActiveResolutionWarning(
    resolvedPaths: string[],
    active: Pick<ActiveGlobalCommandResolution, 'packageManager' | 'resolvedPath'>
): string | null {
    if (!active.resolvedPath) {
        return '⚠ ccstatusline is not currently resolvable on PATH. Claude Code runs ccstatusline, so restart your shell or update PATH if it cannot launch.';
    }

    const resolvedDirs = getUniqueResolvedDirs(resolvedPaths);
    if (resolvedDirs.length > 1) {
        return `⚠ Multiple ccstatusline binaries are on PATH. Claude Code will run the first match: ${active.resolvedPath}.\nOther matches: ${formatPathList(resolvedPaths.slice(1))}`;
    }

    if (active.packageManager === 'unknown') {
        return `⚠ ccstatusline resolves to ${active.resolvedPath}, but it is outside the detected npm and bun global bin directories.`;
    }

    return null;
}

export function inspectActiveGlobalCommand({
    commandAvailability,
    platform = process.platform
}: InspectActiveGlobalCommandOptions): ActiveGlobalCommandResolution {
    const resolvedPaths = getPersistentCommandResolutionPaths(getCommandResolutionPaths('ccstatusline', { platform }));
    const resolvedPath = resolvedPaths[0] ?? null;
    const managerBins: Record<GlobalPackageManager, string | null> = {
        npm: getManagerBinDir('npm', commandAvailability.npm, platform),
        bun: getManagerBinDir('bun', commandAvailability.bun, platform)
    };
    const active = resolvedPath
        ? getActivePackageManager(resolvedPath, managerBins)
        : { packageManager: 'unknown' as const, binDir: null };

    return {
        ...active,
        resolvedPath,
        resolvedPaths,
        version: resolvedPath ? getGlobalPackageVersion(active.packageManager, active.binDir, platform) : null,
        warning: getActiveResolutionWarning(resolvedPaths, {
            packageManager: active.packageManager,
            resolvedPath
        })
    };
}

export function inspectGlobalPackageInstallations({
    commandAvailability,
    platform = process.platform
}: InspectGlobalPackageInstallationsOptions): GlobalPackageInstallation[] {
    const resolvedPaths = getPersistentCommandResolutionPaths(getCommandResolutionPaths('ccstatusline', { platform }));
    return [
        inspectPackageManager('npm', commandAvailability.npm, resolvedPaths, platform),
        inspectPackageManager('bun', commandAvailability.bun, resolvedPaths, platform)
    ];
}

export function runGlobalPackageUninstall(
    packageManager: GlobalPackageManager,
    { platform = process.platform }: RunGlobalPackageUninstallOptions = {}
): Promise<void> {
    const executable = getPackageManagerExecutable(packageManager, platform);
    const args = packageManager === 'npm'
        ? ['uninstall', '-g', 'ccstatusline']
        : ['remove', '-g', 'ccstatusline'];

    return new Promise((resolve, reject) => {
        execFile(executable, args, { timeout: GLOBAL_PACKAGE_TIMEOUT_MS, windowsHide: true }, (error) => {
            if (error) {
                reject(error instanceof Error ? error : new Error('Global uninstall command failed'));
                return;
            }

            resolve();
        });
    });
}
