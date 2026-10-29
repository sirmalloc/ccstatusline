import type * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

// Real git, no mocks: each test plants a repository whose own config would run a
// script, checks that git as the status line runs it never does, then checks
// plain git does, so the setup is a real attack. execGit runs in its own
// process, as other suites mock child_process globally under Bun.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;

describe.skipIf(process.platform === 'win32')('git hardening against repository config', () => {
    const savedEnv = {
        GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
        GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
        PATH: process.env.PATH
    };
    let root = '';
    let marker = '';
    let globalConfig = '';
    let probePath = '';

    // execGit's output, or null when it threw
    function execGit(args: string[], cwd: string): string | null {
        const result = JSON.parse(execFileSync(process.execPath, [probePath, JSON.stringify([args, cwd])], { encoding: 'utf8' })) as { output: string | null };
        return result.output;
    }

    function script(name: string, body: string): string {
        const file = path.join(root, name);
        fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
        return file;
    }

    function plainGit(cwd: string, ...args: string[]): string {
        return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    }

    function makeRepo(name: string, attributes?: string): string {
        const dir = path.join(root, name);
        fs.mkdirSync(dir);
        plainGit(dir, 'init', '-q');
        if (attributes) {
            fs.writeFileSync(path.join(dir, '.gitattributes'), attributes);
        }
        fs.writeFileSync(path.join(dir, 'f'), 'hi\n');
        plainGit(dir, 'add', '.');
        plainGit(dir, 'commit', '-qm', 'init');
        return dir;
    }

    // A new mtime makes status re-read the file, which runs its clean filter
    function touchLater(dir: string): void {
        const later = new Date(Date.now() + 60_000);
        fs.utimesSync(path.join(dir, 'f'), later, later);
    }

    function ran(): boolean {
        return fs.existsSync(marker);
    }

    function plainGitRuns(cwd: string, ...args: string[]): boolean {
        try {
            plainGit(cwd, ...args);
        } catch {
            // Only whether the planted script ran matters
        }
        return ran();
    }

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-hardening-'));
        const bundlePath = path.join(root, 'git.mjs');
        probePath = path.join(root, 'probe.mjs');
        execFileSync('bun', ['build', fileURLToPath(new URL('../git.ts', import.meta.url)), '--target=node', `--outfile=${bundlePath}`], { stdio: 'pipe' });
        fs.writeFileSync(probePath, `
            import { execGit } from './git.mjs';
            const [args, cwd] = JSON.parse(process.argv[2]);
            let output = null;
            try {
                output = execGit(args, cwd);
            } catch {}
            console.log(JSON.stringify({ output }));
        `);
        marker = path.join(root, 'ran');
        globalConfig = path.join(root, 'global-gitconfig');
        fs.writeFileSync(globalConfig, '');
        process.env.GIT_CONFIG_GLOBAL = globalConfig;
        process.env.GIT_CONFIG_NOSYSTEM = '1';
    });

    afterAll(() => {
        if (savedEnv.GIT_CONFIG_GLOBAL === undefined) {
            delete process.env.GIT_CONFIG_GLOBAL;
        } else {
            process.env.GIT_CONFIG_GLOBAL = savedEnv.GIT_CONFIG_GLOBAL;
        }
        if (savedEnv.GIT_CONFIG_NOSYSTEM === undefined) {
            delete process.env.GIT_CONFIG_NOSYSTEM;
        } else {
            process.env.GIT_CONFIG_NOSYSTEM = savedEnv.GIT_CONFIG_NOSYSTEM;
        }
        process.env.PATH = savedEnv.PATH;
        fs.rmSync(root, { recursive: true, force: true });
    });

    beforeEach(() => {
        fs.rmSync(marker, { force: true });
    });

    it('does not run core.fsmonitor from the repository config', () => {
        const dir = makeRepo('fsmonitor');
        plainGit(dir, 'config', 'core.fsmonitor', script('fsmonitor.sh', `touch "${marker}"; exit 1`));

        execGit(['status', '--porcelain', '-z'], dir);
        execGit(['diff', '--shortstat'], dir);
        execGit(['diff', '--cached', '--shortstat'], dir);
        execGit(['ls-files', '--unmerged'], dir);
        execGit(['rev-parse', '--is-inside-work-tree'], dir);

        expect(ran()).toBe(false);
        expect(plainGitRuns(dir, 'status', '--porcelain')).toBe(true);
    });

    it('does not use a bare repository found by searching upward', () => {
        const bare = path.join(root, 'download', 'repo.git');
        fs.mkdirSync(path.dirname(bare), { recursive: true });
        plainGit(root, 'init', '-q', '--bare', bare);
        plainGit(bare, 'config', 'core.bare', 'false');
        plainGit(bare, 'config', 'core.worktree', '..');
        plainGit(bare, 'config', 'core.fsmonitor', script('bare-fsmonitor.sh', `touch "${marker}"; exit 1`));
        const inside = path.join(bare, 'refs');

        expect(execGit(['status', '--porcelain', '-z'], inside)).toBeNull();
        expect(ran()).toBe(false);
        expect(plainGitRuns(inside, 'status', '--porcelain')).toBe(true);
    });

    it('does not run filter drivers from the repository config, including included files', () => {
        const dir = makeRepo('filters', '* filter=evil\nf filter=evil2\n');
        const filter = script('filter.sh', `touch "${marker}"; cat`);
        plainGit(dir, 'config', 'filter.evil.clean', filter);
        fs.writeFileSync(path.join(dir, '.git', 'extra.cfg'), `[filter "evil2"]\n\tclean = ${filter}\n`);
        plainGit(dir, 'config', 'include.path', 'extra.cfg');
        touchLater(dir);

        execGit(['status', '--porcelain', '-z'], dir);
        execGit(['diff', '--shortstat'], dir);

        expect(ran()).toBe(false);
        expect(plainGitRuns(dir, 'status', '--porcelain')).toBe(true);
    });

    it('keeps running filter drivers from the user\'s own config', () => {
        fs.writeFileSync(globalConfig, '[filter "upper"]\n\tclean = tr a-z A-Z\n');
        try {
            const dir = makeRepo('global-filter', 'f filter=upper\n');
            touchLater(dir);

            // The committed blob holds "HI"; without the filter "hi" would differ
            expect(execGit(['status', '--porcelain', '-z'], dir)).toBe('');
        } finally {
            fs.writeFileSync(globalConfig, '');
        }
    });

    it('keeps Git LFS installed into the repository config', () => {
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(path.join(bin, 'git-lfs'), `#!/bin/sh\ntouch "${marker}"\ncat\n`, { mode: 0o755 });
        process.env.PATH = `${bin}${path.delimiter}${savedEnv.PATH ?? ''}`;
        try {
            const dir = makeRepo('local-lfs', 'f filter=lfs\n');
            plainGit(dir, 'config', 'filter.lfs.clean', 'git-lfs clean -- %f');
            plainGit(dir, 'config', 'filter.lfs.smudge', 'git-lfs smudge -- %f');
            touchLater(dir);

            execGit(['status', '--porcelain', '-z'], dir);

            expect(ran()).toBe(true);
        } finally {
            process.env.PATH = savedEnv.PATH;
        }
    });

    it('skips status and diff when a repository filter name can\'t be overridden', () => {
        const dir = makeRepo('odd-name', '* filter=a=b\n');
        plainGit(dir, 'config', 'filter.a=b.clean', script('odd-filter.sh', `touch "${marker}"; cat`));
        touchLater(dir);

        expect(execGit(['status', '--porcelain', '-z'], dir)).toBeNull();
        expect(ran()).toBe(false);
    });
});
