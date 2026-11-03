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

import { gitCommandOf } from './git-test-helpers';

// Real git, no mocks: output is only kept past the TTL because of what git is
// expected to touch when a repository changes, so these check it against git
// itself. Each render runs in its own process, as a real one does and because
// other suites mock child_process globally under Bun. A git wrapper on PATH logs
// each command, and a very short TTL leaves only that output in the cache.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;

// A render runs several processes, which can be slow on a loaded machine
const TEST_TIMEOUT_MS = 60_000;

// What git prints for a one-line change, leading space included
const ONE_LINE_ADDED = ' 1 file changed, 1 insertion(+)';

interface Render {
    inside: boolean;
    branch: string | null;
    sha: string | null;
    staged: string | null;
    unstaged: string | null;
    commands: string[];
}

describe.skipIf(process.platform === 'win32')('git cache against real git', () => {
    let root = '';
    let probePath = '';
    let logPath = '';
    let binDir = '';
    let globalConfig = '';
    let repoCount = 0;

    function plainGit(cwd: string, ...args: string[]): string {
        return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' }
        });
    }

    function render(cwd: string, fields: string[] = ['inside', 'branch', 'unstaged', 'staged']): Render {
        fs.rmSync(logPath, { force: true });
        const output = execFileSync(process.execPath, [probePath, cwd, JSON.stringify(fields)], {
            encoding: 'utf8',
            env: {
                ...process.env,
                HOME: root,
                USERPROFILE: root,
                PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
                GIT_CONFIG_GLOBAL: globalConfig,
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_LOG: logPath
            }
        });
        const commands = fs.existsSync(logPath)
            ? fs.readFileSync(logPath, 'utf8').trim().split('\n').map(line => gitCommandOf(line.split(' ')))
            : [];
        return { ...(JSON.parse(output) as Omit<Render, 'commands'>), commands };
    }

    // One commit, then a second that adds a line to f, so a soft reset staged it
    function makeRepo(...initArgs: string[]): string {
        repoCount += 1;
        const dir = path.join(root, `repo-${repoCount}`);
        fs.mkdirSync(dir);
        plainGit(dir, 'init', '-q', '-b', 'main', ...initArgs);
        fs.writeFileSync(path.join(dir, 'f'), 'one\n');
        plainGit(dir, 'add', '.');
        plainGit(dir, 'commit', '-qm', 'first');
        fs.appendFileSync(path.join(dir, 'f'), 'two\n');
        plainGit(dir, 'add', '.');
        plainGit(dir, 'commit', '-qm', 'second');
        return dir;
    }

    beforeAll(() => {
        root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-cache-')));
        const bundlePath = path.join(root, 'git.mjs');
        probePath = path.join(root, 'probe.mjs');
        logPath = path.join(root, 'git.log');
        binDir = path.join(root, 'bin');
        globalConfig = path.join(root, 'global-gitconfig');
        fs.writeFileSync(globalConfig, '');
        fs.mkdirSync(binDir);

        const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
        fs.writeFileSync(path.join(binDir, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GIT_LOG"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });

        execFileSync('bun', ['build', fileURLToPath(new URL('../git.ts', import.meta.url)), '--target=node', `--outfile=${bundlePath}`], { stdio: 'pipe' });
        fs.writeFileSync(probePath, `
            import { isInsideGitWorkTree, runGit } from './git.mjs';
            const [cwd, fields] = [process.argv[2], JSON.parse(process.argv[3])];
            const context = { data: { cwd }, gitCacheTtlSeconds: 0.001 };
            const read = {
                inside: () => isInsideGitWorkTree(context),
                branch: () => runGit('symbolic-ref HEAD', context),
                sha: () => runGit('rev-parse --short HEAD', context),
                unstaged: () => runGit('diff --shortstat', context),
                staged: () => runGit('diff --cached --shortstat', context)
            };
            console.log(JSON.stringify(Object.fromEntries(fields.map(field => [field, read[field]()]))));
        `);
    }, TEST_TIMEOUT_MS);

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    beforeEach(() => {
        fs.rmSync(path.join(root, '.cache'), { recursive: true, force: true });
    });

    it('runs only the work tree command again when the TTL ends', () => {
        const dir = makeRepo();
        fs.appendFileSync(path.join(dir, 'f'), 'unstaged\n');
        fs.writeFileSync(path.join(dir, 'g'), 'staged\n');
        plainGit(dir, 'add', 'g');

        const cold = render(dir);
        expect(cold.commands).toEqual([
            'rev-parse --is-inside-work-tree',
            'symbolic-ref HEAD',
            'diff --shortstat',
            'diff --cached --shortstat'
        ]);
        expect(cold).toMatchObject({
            inside: true,
            branch: 'refs/heads/main',
            unstaged: ONE_LINE_ADDED,
            staged: ONE_LINE_ADDED
        });

        const expired = render(dir);
        expect(expired.commands).toEqual(['diff --shortstat']);
        expect({ ...expired, commands: [] }).toEqual({ ...cold, commands: [] });
    }, TEST_TIMEOUT_MS);

    it('sees work tree edits as soon as the TTL ends', () => {
        const dir = makeRepo();
        expect(render(dir).unstaged).toBeNull();

        fs.appendFileSync(path.join(dir, 'f'), 'edit\n');

        expect(render(dir).unstaged).toBe(ONE_LINE_ADDED);
    }, TEST_TIMEOUT_MS);

    it('sees a soft reset, which moves the branch but neither HEAD nor the index', () => {
        const dir = makeRepo();
        expect(render(dir).staged).toBeNull();

        plainGit(dir, 'reset', '-q', '--soft', 'HEAD~1');

        expect(render(dir).staged).toBe(ONE_LINE_ADDED);
    }, TEST_TIMEOUT_MS);

    it('sees a soft reset of a branch whose ref is packed', () => {
        const dir = makeRepo();
        plainGit(dir, 'pack-refs', '--all');
        expect(render(dir).staged).toBeNull();

        plainGit(dir, 'reset', '-q', '--soft', 'HEAD~1');

        expect(render(dir).staged).toBe(ONE_LINE_ADDED);
    }, TEST_TIMEOUT_MS);

    it('sees a new branch, a staged change and a commit', () => {
        const dir = makeRepo();
        expect(render(dir)).toMatchObject({ branch: 'refs/heads/main', staged: null });

        plainGit(dir, 'switch', '-q', '-c', 'feature');
        expect(render(dir).branch).toBe('refs/heads/feature');

        fs.appendFileSync(path.join(dir, 'f'), 'three\n');
        plainGit(dir, 'add', 'f');
        expect(render(dir).staged).toBe(ONE_LINE_ADDED);

        plainGit(dir, 'commit', '-qm', 'third');
        expect(render(dir).staged).toBeNull();
    }, TEST_TIMEOUT_MS);

    it('sees a soft reset in a linked worktree, whose branch ref is in the main repository', () => {
        const dir = makeRepo();
        const worktree = path.join(root, `worktree-${repoCount}`);
        plainGit(dir, 'worktree', 'add', '-q', '-b', 'linked', worktree);
        expect(render(worktree)).toMatchObject({ branch: 'refs/heads/linked', staged: null });
        expect(render(worktree).commands).toEqual(['diff --shortstat']);

        plainGit(worktree, 'reset', '-q', '--soft', 'HEAD~1');

        expect(render(worktree).staged).toBe(ONE_LINE_ADDED);
    }, TEST_TIMEOUT_MS);

    it('follows a detached HEAD as it moves', () => {
        const dir = makeRepo();
        plainGit(dir, 'checkout', '-q', '--detach');
        const before = render(dir, ['sha']);
        expect(before.sha).toBe(plainGit(dir, 'rev-parse', '--short', 'HEAD').trim());
        expect(render(dir, ['sha']).commands).toEqual([]);

        plainGit(dir, 'checkout', '-q', '--detach', 'HEAD~1');

        expect(render(dir, ['sha']).sha).toBe(plainGit(dir, 'rev-parse', '--short', 'HEAD').trim());
    }, TEST_TIMEOUT_MS);

    it('keeps following a reftable repository, whose HEAD and ref files never change', () => {
        let dir: string;
        try {
            dir = makeRepo('--ref-format=reftable');
        } catch {
            // git before 2.45 cannot create one
            return;
        }
        expect(render(dir)).toMatchObject({ branch: 'refs/heads/main', staged: null });

        plainGit(dir, 'switch', '-q', '-c', 'feature');
        expect(render(dir).branch).toBe('refs/heads/feature');

        plainGit(dir, 'reset', '-q', '--soft', 'HEAD~1');
        expect(render(dir).staged).toBe(ONE_LINE_ADDED);
    }, TEST_TIMEOUT_MS);
});
