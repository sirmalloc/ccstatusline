export type PackageManagerExecutable = 'npm' | 'npm.cmd' | 'bun';

export function getPackageManagerExecutable(
    packageManager: 'npm' | 'bun',
    platform: NodeJS.Platform = process.platform
): PackageManagerExecutable {
    return packageManager === 'npm' && platform === 'win32'
        ? 'npm.cmd'
        : packageManager;
}
