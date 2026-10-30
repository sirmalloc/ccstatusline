export type PackageManagerExecutable = 'npm' | 'npm.cmd' | 'bun';

export function getPackageManagerShellOptions(
    executable: PackageManagerExecutable,
    platform: NodeJS.Platform = process.platform
): { shell?: true } {
    return platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
        ? { shell: true }
        : {};
}

export function getPackageManagerExecutable(
    packageManager: 'npm' | 'bun',
    platform: NodeJS.Platform = process.platform
): PackageManagerExecutable {
    return packageManager === 'npm' && platform === 'win32'
        ? 'npm.cmd'
        : packageManager;
}
