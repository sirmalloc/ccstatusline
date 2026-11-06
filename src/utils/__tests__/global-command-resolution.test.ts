import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getCommandResolutionPaths,
    getRealDirectory,
    inspectGlobalCommandResolution
} from '../global-command-resolution';
import {
    getPackageManagerExecutable,
    getPackageManagerShellOptions
} from '../package-manager-executable';

function mockExecFileSync(responses: Record<string, string | Error>) {
    const spy = vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
        const key = `${command} ${(args as string[]).join(' ')}`;
        const response = responses[key];

        if (response === undefined) {
            throw new Error(`Unexpected command: ${key}`);
        }

        if (response instanceof Error) {
            throw response;
        }

        return response;
    });

    // Other suites replace child_process wholesale via vi.mock, which is not
    // file-scoped under the bun runner. When one of those runs first, vi.spyOn
    // hands back that already-installed mock along with its accumulated call
    // history, so assertions here would otherwise inspect foreign calls.
    spy.mockClear();

    return spy;
}

// What running a program that isn't installed throws
function missingProgramError(command: string): Error {
    return Object.assign(new Error(`spawnSync ${command} ENOENT`), { code: 'ENOENT' });
}

// What a program that runs and exits with status 1 throws, as `which` does when it finds nothing
function failedCommandError(command: string): Error {
    return Object.assign(new Error(`Command failed: ${command}`), { status: 1 });
}

// macOS and Windows file systems ignore letter case by default; most Linux ones don't
function tempFileSystemIgnoresCase(): boolean {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-case-'));
    try {
        fs.mkdirSync(path.join(dir, 'probe'));
        return fs.existsSync(path.join(dir, 'PROBE'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

describe('global command resolution', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses where on Windows and treats same-directory shims as one install', () => {
        const execFileSyncSpy = mockExecFileSync({
            'where ccstatusline': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd\r\nC:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.ps1\r\n',
            'npm.cmd prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\r\n'
        });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'win32' });

        expect(resolution.resolvedPaths).toEqual([
            'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd',
            'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.ps1'
        ]);
        expect(resolution.warning).toBeNull();
        expect(execFileSyncSpy).toHaveBeenCalledWith(
            'npm.cmd',
            ['prefix', '-g'],
            expect.objectContaining({ shell: true })
        );
    });

    it('resolves the Windows npm executable shim for execFile calls', () => {
        expect(getPackageManagerExecutable('npm', 'win32')).toBe('npm.cmd');
        expect(getPackageManagerExecutable('npm', 'linux')).toBe('npm');
        expect(getPackageManagerExecutable('bun', 'win32')).toBe('bun');
        expect(getPackageManagerShellOptions('npm.cmd', 'win32')).toEqual({ shell: true });
        expect(getPackageManagerShellOptions('npm', 'linux')).toEqual({});
        expect(getPackageManagerShellOptions('bun', 'win32')).toEqual({});
    });

    it('uses which -a on POSIX/WSL', () => {
        mockExecFileSync({ 'which -a ccstatusline': '/home/alice/.bun/bin/ccstatusline\n' });

        expect(getCommandResolutionPaths('ccstatusline', { platform: 'linux' })).toEqual([
            '/home/alice/.bun/bin/ccstatusline'
        ]);
    });

    // Minimal Linux images (Fedora, UBI, Arch without the which package) have no `which`
    it.skipIf(process.platform === 'win32')('looks through PATH itself when there is no which command', () => {
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-path-'));
        const originalPath = process.env.PATH;
        try {
            fs.writeFileSync(path.join(binDir, 'ccstatusline'), '#!/bin/sh\n', { mode: 0o755 });
            process.env.PATH = `${path.join(binDir, 'missing')}:${binDir}`;
            mockExecFileSync({
                'which -a ccstatusline': missingProgramError('which'),
                'bun pm bin -g': `${binDir}\n`
            });

            const resolution = inspectGlobalCommandResolution('bun', { platform: 'linux' });

            expect(resolution.resolvedPaths).toEqual([path.join(binDir, 'ccstatusline')]);
            expect(resolution.warning).toBeNull();
        } finally {
            process.env.PATH = originalPath;
            fs.rmSync(binDir, { recursive: true, force: true });
        }
    });

    it.skipIf(process.platform === 'win32')('does not look through PATH itself when which runs and fails', () => {
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-path-'));
        const originalPath = process.env.PATH;
        try {
            fs.writeFileSync(path.join(binDir, 'ccstatusline'), '#!/bin/sh\n', { mode: 0o755 });
            process.env.PATH = binDir;
            mockExecFileSync({ 'which -a ccstatusline': failedCommandError('which -a ccstatusline') });

            expect(getCommandResolutionPaths('ccstatusline', { platform: 'linux' })).toEqual([]);
        } finally {
            process.env.PATH = originalPath;
            fs.rmSync(binDir, { recursive: true, force: true });
        }
    });

    it('silences child stderr on best-effort probes so failures cannot leak to the terminal', () => {
        const execFileSyncSpy = mockExecFileSync({
            'which -a ccstatusline': '/home/alice/.bun/bin/ccstatusline\n',
            'bun pm bin -g': '/home/alice/.bun/bin\n'
        });

        inspectGlobalCommandResolution('bun', { platform: 'linux' });

        expect(execFileSyncSpy).toHaveBeenCalled();
        for (const call of execFileSyncSpy.mock.calls) {
            const options = call[2] as { stdio?: string[] };
            expect(options.stdio?.[2]).toBe('ignore');
        }
    });

    it('treats a probe that throws with stderr output as not found without surfacing an error', () => {
        vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
            throw new Error('error: No package.json was found for directory "C:\\Users\\alice\\.bun\\install\\global"');
        });

        const resolution = inspectGlobalCommandResolution('bun', { platform: 'win32' });

        expect(resolution.resolvedPaths).toEqual([]);
        expect(resolution.expectedBinDir).toBeNull();
    });

    it('warns when multiple PATH directories contain ccstatusline', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/home/alice/.bun/bin/ccstatusline\n/usr/local/bin/ccstatusline\n',
            'bun pm bin -g': '/home/alice/.bun/bin\n'
        });

        const resolution = inspectGlobalCommandResolution('bun', { platform: 'linux' });

        expect(resolution.warning).toContain('Multiple ccstatusline binaries are on PATH');
        expect(resolution.warning).toContain('/home/alice/.bun/bin/ccstatusline');
        expect(resolution.warning).toContain('/usr/local/bin/ccstatusline');
    });

    // Merged /usr (Ubuntu 22.04+, Debian 12): /bin links to usr/bin and PATH lists both
    it.skipIf(process.platform === 'win32')('counts a PATH directory reached through a symlink once', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-merged-usr-'));
        try {
            fs.mkdirSync(path.join(root, 'usr', 'bin'), { recursive: true });
            fs.writeFileSync(path.join(root, 'usr', 'bin', 'ccstatusline'), '#!/bin/sh\n', { mode: 0o755 });
            fs.symlinkSync('usr/bin', path.join(root, 'bin'));
            mockExecFileSync({
                'which -a ccstatusline': `${root}/usr/bin/ccstatusline\n${root}/bin/ccstatusline\n`,
                'npm prefix -g': `${root}/usr\n`
            });

            const resolution = inspectGlobalCommandResolution('npm', { platform: 'linux' });

            expect(resolution.resolvedPaths).toEqual([`${root}/usr/bin/ccstatusline`, `${root}/bin/ccstatusline`]);
            expect(resolution.warning).toBeNull();
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it.skipIf(process.platform === 'win32')('lists another install once and leaves out other spellings of the first match', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-merged-usr-'));
        try {
            fs.mkdirSync(path.join(root, 'usr', 'bin'), { recursive: true });
            fs.mkdirSync(path.join(root, '.bun', 'bin'), { recursive: true });
            fs.writeFileSync(path.join(root, 'usr', 'bin', 'ccstatusline'), '#!/bin/sh\n', { mode: 0o755 });
            fs.writeFileSync(path.join(root, '.bun', 'bin', 'ccstatusline'), '#!/bin/sh\n', { mode: 0o755 });
            fs.symlinkSync('usr/bin', path.join(root, 'bin'));
            mockExecFileSync({
                'which -a ccstatusline': `${root}/usr/bin/ccstatusline\n${root}/bin/ccstatusline\n${root}/.bun/bin/ccstatusline\n`,
                'npm prefix -g': `${root}/usr\n`
            });

            const resolution = inspectGlobalCommandResolution('npm', { platform: 'linux' });

            expect(resolution.warning).toBe(`⚠ Multiple ccstatusline binaries are on PATH. Claude Code will run the first match: ${root}/usr/bin/ccstatusline.\nOther matches: ${root}/.bun/bin/ccstatusline`);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    // Where letter case is ignored, PATH can spell one directory two ways
    it.skipIf(!tempFileSystemIgnoresCase())('resolves a directory spelled in another letter case to one path', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-case-'));
        try {
            fs.mkdirSync(path.join(root, 'bin'));

            expect(getRealDirectory(path.join(root, 'Bin'))).toBe(getRealDirectory(path.join(root, 'bin')));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    // Bun's plain realpathSync already reports the on-disk case, so only the
    // call itself shows that Node gets the same answer
    it('resolves directories with the native realpath', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-case-'));
        try {
            const nativeSpy = vi.spyOn(fs.realpathSync, 'native');

            getRealDirectory(root);

            expect(nativeSpy).toHaveBeenCalledWith(root);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('ignores transient bunx status line shims when resolving global commands', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/var/folders/demo/T/bunx-501-ccstatusline@latest/node_modules/.bin/ccstatusline\n/Users/alice/.bun/bin/ccstatusline\n',
            'bun pm bin -g': '/Users/alice/.bun/bin\n'
        });

        const resolution = inspectGlobalCommandResolution('bun', { platform: 'darwin' });

        expect(resolution.firstResolvedPath).toBe('/Users/alice/.bun/bin/ccstatusline');
        expect(resolution.resolvedPaths).toEqual(['/Users/alice/.bun/bin/ccstatusline']);
        expect(resolution.warning).toBeNull();
    });

    it('ignores transient npx status line shims when resolving global commands', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/Users/alice/.npm/_npx/9f3c1e2a7b6d4c80/node_modules/.bin/ccstatusline\n/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline\n',
            'npm prefix -g': '/Users/alice/.nvm/versions/node/v24.9.0\n'
        });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'darwin' });

        expect(resolution.firstResolvedPath).toBe('/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline');
        expect(resolution.resolvedPaths).toEqual(['/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline']);
        expect(resolution.warning).toBeNull();
    });

    it('ignores npx shims from a custom npm cache directory', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/srv/cache/npm/_npx/0a1b2c3d4e5f6789/node_modules/.bin/ccstatusline\n/usr/local/bin/ccstatusline\n',
            'npm prefix -g': '/usr/local\n'
        });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'linux' });

        expect(resolution.resolvedPaths).toEqual(['/usr/local/bin/ccstatusline']);
        expect(resolution.warning).toBeNull();
    });

    it('ignores transient npx shims in the Windows npm cache', () => {
        mockExecFileSync({
            'where ccstatusline': [
                'C:\\Users\\Alice\\AppData\\Local\\npm-cache\\_npx\\9f3c1e2a7b6d4c80\\node_modules\\.bin\\ccstatusline',
                'C:\\Users\\Alice\\AppData\\Local\\npm-cache\\_npx\\9f3c1e2a7b6d4c80\\node_modules\\.bin\\ccstatusline.cmd',
                'C:\\Users\\Alice\\AppData\\Local\\npm-cache\\_npx\\9f3c1e2a7b6d4c80\\node_modules\\.bin\\ccstatusline.ps1',
                'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd',
                ''
            ].join('\r\n'),
            'npm.cmd prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\r\n'
        });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'win32' });

        expect(resolution.resolvedPaths).toEqual(['C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd']);
        expect(resolution.warning).toBeNull();
    });

    it('compares Windows npm prefixes with WSL /mnt paths', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/mnt/c/Users/Alice/AppData/Roaming/npm/ccstatusline\n',
            'npm prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\n'
        });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'linux' });

        expect(resolution.expectedBinDir).toBe('C:\\Users\\Alice\\AppData\\Roaming\\npm');
        expect(resolution.warning).toBeNull();
    });

    it('warns when the first resolved binary is outside the selected manager bin directory', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/usr/local/bin/ccstatusline\n',
            'bun pm bin -g': '/home/alice/.bun/bin\n'
        });

        const resolution = inspectGlobalCommandResolution('bun', { platform: 'linux' });

        expect(resolution.warning).toContain('outside the bun global bin directory');
        expect(resolution.warning).toContain('/usr/local/bin/ccstatusline');
    });

    it('warns when ccstatusline is not resolvable after a global install', () => {
        mockExecFileSync({ 'npm prefix -g': '/usr/local\n' });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'linux' });

        expect(resolution.warning).toContain('not currently resolvable on PATH');
    });
});
