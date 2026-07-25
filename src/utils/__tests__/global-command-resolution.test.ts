import * as childProcess from 'child_process';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getCommandResolutionPaths,
    inspectGlobalCommandResolution
} from '../global-command-resolution';
import {
    getPackageManagerExecutable,
    getPackageManagerShellOptions
} from '../package-manager-executable';

function mockExecFileSync(responses: Record<string, string>) {
    return vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
        const key = `${command} ${(args as string[]).join(' ')}`;
        const response = responses[key];

        if (response === undefined) {
            throw new Error(`Unexpected command: ${key}`);
        }

        return response;
    });
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

    it('silences child stderr on best-effort probes so failures cannot leak to the terminal', () => {
        const execFileSyncSpy = mockExecFileSync({
            'which -a ccstatusline': '/home/alice/.bun/bin/ccstatusline\n',
            'bun pm bin -g': '/home/alice/.bun/bin\n'
        });

        inspectGlobalCommandResolution('bun', { platform: 'linux' });

        expect(execFileSyncSpy).toHaveBeenCalled();
        for (const call of execFileSyncSpy.mock.calls) {
            const options = call[2] as { stdio?: string[] };
            expect(options.stdio).toEqual(['ignore', 'pipe', 'ignore']);
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
