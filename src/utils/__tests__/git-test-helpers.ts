import type * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterAll,
    beforeAll,
    expect
} from 'vitest';

import {
    clearGitCache,
    runGit
} from '../git';
import { GIT_HARDENING_ARGS } from '../git-hardening';

// Git command mocks must not discover filters or includes in the checkout's
// real config (actions/checkout adds credential includes in CI). A .git entry
// also stops discovery from walking into a repository above the temp directory.
export function isolateGitWorkingDirectory(): void {
    let originalCwd = '';
    let directory = '';

    beforeAll(() => {
        originalCwd = process.cwd();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-unit-'));
        fs.mkdirSync(path.join(directory, '.git'));
        fs.writeFileSync(path.join(directory, '.git', 'config'), '');
        process.chdir(directory);
    });

    afterAll(() => {
        if (originalCwd) {
            process.chdir(originalCwd);
        }
        if (directory) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
}

export function expectGitExecOptions(options: unknown, cwd?: string): void {
    expect(options).toEqual(expect.objectContaining({
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 5_000,
        windowsHide: true,
        ...(cwd ? { cwd } : {})
    }));

    expect((options as { env?: Record<string, string | undefined> }).env?.GIT_OPTIONAL_LOCKS).toBe('0');

    if (!cwd)
        expect(options).not.toHaveProperty('cwd');
}

// What execGit adds to status and diff, after the subcommand
const WORK_TREE_SAFETY_OPTIONS = new Set(['--ignore-submodules=dirty', '--no-ext-diff', '--no-textconv']);

/** The command a fake git answers, without the hardening every call carries */
export function gitCommandOf(args: string[]): string {
    const command = args.slice(GIT_HARDENING_ARGS.length);
    expect(args.slice(0, GIT_HARDENING_ARGS.length)).toEqual(GIT_HARDENING_ARGS);
    return command.filter(arg => !WORK_TREE_SAFETY_OPTIONS.has(arg)).join(' ');
}

// Sibling suites mock node:child_process and that mock leaks across files
// under the bun runner, so the real builtin comes from the CJS loader, which
// the mocks never reach (the same escape hatch as git-hardening-exec.test.ts).
const require = createRequire(import.meta.url);
const { spawnSync } = require('node:child_process') as typeof childProcess;

// Git invoked with the real builtin, immune to the sibling mocks above.
export function gitSync(args: string[], env?: NodeJS.ProcessEnv): void {
    const runEnv = env ?? process.env;
    const result = spawnSync('git', args, { env: runEnv });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
    }
}

export const COMMIT_ENV: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com'
};

// Sibling suites mock node:child_process and, when a test file shares the bun
// runner's single process with them, that mock can reach git.ts's own
// spawnSync (the copy of the module loaded after their vi.mock call), making
// every runGit resolve to null. Probe runGit end to end once and skip the
// real-git suites when it is broken; vitest isolates test files and always
// runs them, as does an isolated `bun test <file>`.
export function probeRealRunGitAvailable(): boolean {
    try {
        const probeRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-run-git-probe-'));
        gitSync(['init', '-q', probeRepo]);
        gitSync(['-C', probeRepo, 'remote', 'add', 'origin', 'https://example.com/x.git']);
        clearGitCache();
        const remotes = runGit('remote', { data: { cwd: probeRepo }, gitCacheTtlSeconds: 0 });
        clearGitCache();
        // an empty output resolves to null too, hence the dummy remote
        return remotes !== null;
    } catch {
        return false;
    }
}
