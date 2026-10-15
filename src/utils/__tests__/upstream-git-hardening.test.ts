import {
    chmodSync,
    existsSync,
    mkdtempSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    clearGitCache,
    runGit
} from '../git';
import {
    getFilterOverrideArgs,
    parseFilterConfig,
    withGitHardeningEnv
} from '../git-hardening';

import {
    COMMIT_ENV,
    gitSync,
    probeRealRunGitAvailable
} from './git-test-helpers';

// Upstream 810d424 (GHSA-rf4f-gc2h-c9vp): status-line Git calls must not
// execute commands a repository controls. core.fsmonitor points at a
// repository-controlled command; hardened Git calls override it with an
// empty value, so the command must never run.

const realRunGitAvailable = probeRealRunGitAvailable();

describe.skipIf(!realRunGitAvailable)('upstream 810d424: git calls ignore repository-controlled commands', () => {
    let savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        savedEnv = {
            HOME: process.env.HOME,
            GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
            GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM
        };
        process.env.HOME = mkdtempSync(join(tmpdir(), 'ccsl-git-hardening-home-'));
        process.env.GIT_CONFIG_GLOBAL = '/dev/null';
        process.env.GIT_CONFIG_SYSTEM = '/dev/null';
    });

    afterEach(() => {
        process.env.HOME = savedEnv.HOME;
        process.env.GIT_CONFIG_GLOBAL = savedEnv.GIT_CONFIG_GLOBAL;
        process.env.GIT_CONFIG_SYSTEM = savedEnv.GIT_CONFIG_SYSTEM;
        clearGitCache();
    });

    it('does not run the core.fsmonitor command from the repository config', () => {
        const root = mkdtempSync(join(tmpdir(), 'ccsl-git-hardening-'));
        const repo = join(root, 'repo');
        const marker = join(root, 'fsmonitor-ran');
        const hook = join(root, 'fsmonitor-hook');

        writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\necho\n`);
        chmodSync(hook, 0o755);

        gitSync(['init', '-b', 'main', repo]);
        gitSync(['-C', repo, 'commit', '--allow-empty', '-m', 'init'], COMMIT_ENV);
        gitSync(['-C', repo, 'config', 'core.fsmonitor', hook]);

        runGit('status --porcelain -z', { data: { cwd: repo }, gitCacheTtlSeconds: 60 });

        expect(existsSync(marker)).toBe(false);
    });
});

// The allowlist that keeps legitimate filters (Git LFS, git-crypt) running
// while overriding everything else a repository's config defines.
describe('upstream 810d424: filter override decisions', () => {
    const REPO_ROOT = '/repo';

    function overridesFor(scope: string, name: string, key: string, value: string): string[] | null {
        return getFilterOverrideArgs([{ scope, name, key, value }], REPO_ROOT);
    }

    it('overrides a hostile local filter', () => {
        expect(overridesFor('local', 'ghost', 'clean', '/injected'))
            .toEqual([
                '-c', 'filter.ghost.clean=',
                '-c', 'filter.ghost.smudge=',
                '-c', 'filter.ghost.process=',
                '-c', 'filter.ghost.required=false'
            ]);
    });

    it('overrides a worktree-scoped filter but not a user-scoped one', () => {
        expect(overridesFor('worktree', 'wt', 'process', '/injected')).not.toBeNull();
        expect(overridesFor('global', 'mine', 'clean', '/mine')).toEqual([]);
    });

    it('keeps the standard Git LFS commands running', () => {
        expect(overridesFor('local', 'lfs', 'clean', 'git-lfs clean -- %f')).toEqual([]);
        expect(overridesFor('local', 'lfs', 'smudge', 'git-lfs smudge -- %f')).toEqual([]);
        expect(overridesFor('local', 'lfs', 'process', 'git-lfs filter-process')).toEqual([]);
    });

    it('does not allowlist a git-crypt command preceded by other shell text', () => {
        expect(overridesFor('local', 'crypt', 'clean', 'echo pwned; "/usr/bin/git-crypt" clean'))
            .toContain('filter.crypt.clean=');
    });

    it('treats a windows-style path with leading junk as relative', () => {
        expect(overridesFor('local', 'crypt', 'clean', 'evilC:/git-crypt clean'))
            .toContain('filter.crypt.clean=');
    });

    it('keeps git-crypt running only from an absolute path outside the repo', () => {
        expect(overridesFor('local', 'crypt', 'clean', '"/usr/local/bin/git-crypt" clean')).toEqual([]);
        expect(overridesFor('local', 'crypt', 'smudge', '/usr/local/bin/git-crypt smudge')).toEqual([]);
        expect(overridesFor('local', 'crypt', 'clean', 'C:\\tools\\git-crypt clean')).toEqual([]);
        expect(overridesFor('local', 'crypt', 'clean', 'C:/tools/git-crypt clean')).toEqual([]);
        expect(overridesFor('local', 'crypt', 'clean', '"C:\\tools\\git-crypt.exe" clean')).toEqual([]);

        // Inside the repository, or not git-crypt at all: override.
        expect(overridesFor('local', 'crypt', 'clean', '"/repo/.git/bin/git-crypt" clean'))
            .toContain('filter.crypt.clean=');
        expect(overridesFor('local', 'crypt', 'clean', '/usr/bin/other clean'))
            .toContain('filter.crypt.clean=');
    });

    it('does not let a command for a different key through the allowlist', () => {
        expect(overridesFor('local', 'crypt', 'clean', '"/usr/bin/git-crypt" smudge'))
            .toContain('filter.crypt.clean=');
        expect(overridesFor('local', 'crypt', 'smudge', '"/usr/bin/git-crypt" clean'))
            .toContain('filter.crypt.smudge=');
    });

    it('refuses to override a filter whose name contains =', () => {
        expect(overridesFor('local', 'a=b', 'clean', '/injected')).toBeNull();
    });
});

describe('upstream 810d424: filter config parsing', () => {
    it('parses scoped git config output into entries', () => {
        const output = 'local\0filter.ghost.clean\n/injected\0worktree\0filter.other.smudge\nx\0';

        expect(parseFilterConfig(output, true)).toEqual([
            { scope: 'local', name: 'ghost', key: 'clean', value: '/injected' },
            { scope: 'worktree', name: 'other', key: 'smudge', value: 'x' }
        ]);
    });

    it('treats unscoped lookup output as repository-owned', () => {
        expect(parseFilterConfig('filter.ghost.clean\n/injected\0', false)).toEqual([
            { scope: 'local', name: 'ghost', key: 'clean', value: '/injected' }
        ]);
    });

    it('skips entries with an empty scope or key/value field', () => {
        expect(parseFilterConfig('\0filter.ghost.clean\nx\0', true)).toEqual([]);
        expect(parseFilterConfig('local\0\0', true)).toEqual([]);
    });

    it('splits key and value on the first newline only', () => {
        expect(parseFilterConfig('local\0filter.ghost.clean\0', true)).toEqual([
            { scope: 'local', name: 'ghost', key: 'clean', value: '' }
        ]);
    });

    it('ignores keys outside the filter.* namespace and bare filter names', () => {
        expect(parseFilterConfig('local\0user.name\nt\0', true)).toEqual([]);
        expect(parseFilterConfig('local\0filter.ghost\nt\0', true)).toEqual([]);
    });

    it('does not parse deep non-filter keys as filter drivers', () => {
        expect(parseFilterConfig('local\0user.alice.name\nt\0', true)).toEqual([]);
    });

    it('does not parse a filter key with an empty driver name', () => {
        expect(parseFilterConfig('local\0filter..x\nv\0', true)).toEqual([]);
    });

    it('keeps parsing after a non-filter entry', () => {
        const output = 'local\0user.name\nt\0local\0filter.ghost.clean\nx\0';

        expect(parseFilterConfig(output, true)).toEqual([
            { scope: 'local', name: 'ghost', key: 'clean', value: 'x' }
        ]);
    });
});

describe('upstream 810d424: hardening env for wrapped git calls', () => {
    it('appends the hardening config to a fresh environment', () => {
        const hardened = withGitHardeningEnv({});

        expect(hardened.GIT_CONFIG_KEY_0).toBe('core.fsmonitor');
        expect(hardened.GIT_CONFIG_VALUE_0).toBe('');
        expect(hardened.GIT_CONFIG_KEY_1).toBe('safe.bareRepository');
        expect(hardened.GIT_CONFIG_VALUE_1).toBe('explicit');
        expect(hardened.GIT_CONFIG_COUNT).toBe('2');
    });

    it('continues after GIT_CONFIG_COUNT entries the environment already has', () => {
        const hardened = withGitHardeningEnv({
            GIT_CONFIG_COUNT: '3',
            GIT_CONFIG_KEY_2: 'user.name'
        });

        expect(hardened.GIT_CONFIG_KEY_3).toBe('core.fsmonitor');
        expect(hardened.GIT_CONFIG_KEY_4).toBe('safe.bareRepository');
        expect(hardened.GIT_CONFIG_COUNT).toBe('5');
    });

    it('starts from zero for a non-numeric or negative GIT_CONFIG_COUNT', () => {
        const nanCase = withGitHardeningEnv({ GIT_CONFIG_COUNT: 'not-a-number' });

        expect(nanCase.GIT_CONFIG_KEY_0).toBe('core.fsmonitor');
        expect(nanCase.GIT_CONFIG_COUNT).toBe('2');

        const negativeCase = withGitHardeningEnv({ GIT_CONFIG_COUNT: '-2' });

        expect(negativeCase.GIT_CONFIG_KEY_0).toBe('core.fsmonitor');
        expect(negativeCase.GIT_CONFIG_COUNT).toBe('2');
    });
});
