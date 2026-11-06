import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    findAllOnPosixPath,
    resolveExecutable
} from '../executable-path';

function windows(files: string[], env: NodeJS.ProcessEnv = { Path: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd' }) {
    const present = new Set(files.map(file => file.toLowerCase()));
    return {
        platform: 'win32' as const,
        env,
        isFile: (candidate: string) => present.has(candidate.toLowerCase())
    };
}

describe('resolveExecutable', () => {
    it('leaves names alone outside Windows, where only PATH is searched', () => {
        expect(resolveExecutable('git', { platform: 'darwin', env: {}, isFile: () => false })).toBe('git');
        expect(resolveExecutable('git', { platform: 'linux', env: {}, isFile: () => false })).toBe('git');
    });

    it('finds a program on PATH with the extensions Windows runs directly', () => {
        expect(resolveExecutable('git', windows(['C:\\Program Files\\Git\\cmd\\git.exe']))).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
        expect(resolveExecutable('tool', windows(['C:\\Windows\\System32\\tool.com']))).toBe('C:\\Windows\\System32\\tool.com');
    });

    it('keeps an explicit extension', () => {
        expect(resolveExecutable('chcp.com', windows(['C:\\Windows\\System32\\chcp.com']))).toBe('C:\\Windows\\System32\\chcp.com');
    });

    it('takes the first match in PATH order', () => {
        const lookup = windows(['C:\\Windows\\System32\\git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe']);

        expect(resolveExecutable('git', lookup)).toBe('C:\\Windows\\System32\\git.exe');
    });

    // The point: a git.exe in the current directory must never be the one that runs
    it.each([
        ['"."', '.;C:\\Program Files\\Git\\cmd'],
        ['an empty entry', ';C:\\Program Files\\Git\\cmd'],
        ['a relative entry', 'tools;C:\\Program Files\\Git\\cmd']
    ])('skips %s in PATH', (_label, pathValue) => {
        const lookup = windows(['.\\git.exe', 'git.exe', 'tools\\git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe'], { Path: pathValue });

        expect(resolveExecutable('git', lookup)).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
    });

    it('reads PATH whatever its case and accepts quoted entries', () => {
        expect(resolveExecutable('gh', windows(['C:\\Program Files\\GitHub CLI\\gh.exe'], { PATH: '"C:\\Program Files\\GitHub CLI"' }))).toBe('C:\\Program Files\\GitHub CLI\\gh.exe');
    });

    it('throws when the program isn\'t on PATH, so callers treat it as missing', () => {
        expect(() => resolveExecutable('jj', windows(['jj.exe']))).toThrow('jj');
    });

    it('leaves a path alone', () => {
        expect(resolveExecutable('C:\\tools\\git.exe', windows([]))).toBe('C:\\tools\\git.exe');
    });
});

function posix(executables: string[], pathValue: string) {
    const present = new Set(executables);
    return {
        env: { PATH: pathValue },
        isExecutableFile: (candidate: string) => present.has(candidate)
    };
}

describe('findAllOnPosixPath', () => {
    it('lists every match in PATH order, as which -a does', () => {
        const search = posix(
            ['/usr/local/bin/ccstatusline', '/home/alice/.bun/bin/ccstatusline'],
            '/home/alice/.bun/bin:/usr/bin:/usr/local/bin'
        );

        expect(findAllOnPosixPath('ccstatusline', search)).toEqual([
            '/home/alice/.bun/bin/ccstatusline',
            '/usr/local/bin/ccstatusline'
        ]);
    });

    it('lists a directory that PATH repeats once', () => {
        expect(findAllOnPosixPath('npm', posix(['/usr/bin/npm'], '/usr/bin:/bin:/usr/bin'))).toEqual(['/usr/bin/npm']);
    });

    it('skips empty and relative PATH entries', () => {
        expect(findAllOnPosixPath('npm', posix(['./npm', 'node_modules/.bin/npm', '/bin/npm'], '/usr/bin::node_modules/.bin:/bin'))).toEqual(['/bin/npm']);
    });

    it('finds nothing without a PATH', () => {
        expect(findAllOnPosixPath('npm', { env: {}, isExecutableFile: () => true })).toEqual([]);
    });

    // A test or a caller may swap in a new env object; the lookup must see it
    it.skipIf(process.platform === 'win32')('reads PATH from process.env as it is when called', () => {
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-path-env-'));
        const originalEnv = process.env;
        try {
            fs.writeFileSync(path.join(binDir, 'npm'), '#!/bin/sh\n', { mode: 0o755 });
            process.env = { ...originalEnv, PATH: binDir };

            expect(findAllOnPosixPath('npm')).toEqual([path.join(binDir, 'npm')]);
        } finally {
            process.env = originalEnv;
            fs.rmSync(binDir, { recursive: true, force: true });
        }
    });

    it.skipIf(process.platform === 'win32')('only lists files the user can run', () => {
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-path-scan-'));
        const originalPath = process.env.PATH;
        try {
            fs.writeFileSync(path.join(binDir, 'npm'), '#!/bin/sh\n', { mode: 0o755 });
            fs.writeFileSync(path.join(binDir, 'bun'), '#!/bin/sh\n', { mode: 0o644 });
            fs.mkdirSync(path.join(binDir, 'bunx'));
            fs.symlinkSync('npm', path.join(binDir, 'npx'));
            process.env.PATH = binDir;

            expect(findAllOnPosixPath('npm')).toEqual([path.join(binDir, 'npm')]);
            expect(findAllOnPosixPath('npx')).toEqual([path.join(binDir, 'npx')]);
            expect(findAllOnPosixPath('bun')).toEqual([]);
            expect(findAllOnPosixPath('bunx')).toEqual([]);
        } finally {
            process.env.PATH = originalPath;
            fs.rmSync(binDir, { recursive: true, force: true });
        }
    });
});
