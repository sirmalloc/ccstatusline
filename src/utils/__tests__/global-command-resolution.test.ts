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
import { getPackageManagerExecutable } from '../package-manager-executable';

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
        mockExecFileSync({
            'where ccstatusline': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd\r\nC:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.ps1\r\n',
            'npm.cmd prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\r\n'
        });

        const resolution = inspectGlobalCommandResolution('npm', { platform: 'win32' });

        expect(resolution.resolvedPaths).toEqual([
            'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd',
            'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.ps1'
        ]);
        expect(resolution.warning).toBeNull();
    });

    it('resolves the Windows npm executable shim for execFile calls', () => {
        expect(getPackageManagerExecutable('npm', 'win32')).toBe('npm.cmd');
        expect(getPackageManagerExecutable('npm', 'linux')).toBe('npm');
        expect(getPackageManagerExecutable('bun', 'win32')).toBe('bun');
    });

    it('uses which -a on POSIX/WSL', () => {
        mockExecFileSync({ 'which -a ccstatusline': '/home/alice/.bun/bin/ccstatusline\n' });

        expect(getCommandResolutionPaths('ccstatusline', { platform: 'linux' })).toEqual([
            '/home/alice/.bun/bin/ccstatusline'
        ]);
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
