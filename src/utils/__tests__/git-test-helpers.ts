import { expect } from 'vitest';

import { GIT_HARDENING_ARGS } from '../git-hardening';

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
