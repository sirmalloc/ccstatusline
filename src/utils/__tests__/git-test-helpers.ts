import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterAll,
    beforeAll,
    expect
} from 'vitest';

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
