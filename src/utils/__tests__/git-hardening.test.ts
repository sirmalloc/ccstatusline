import {
    describe,
    expect,
    it
} from 'vitest';

import {
    GIT_HARDENING_ARGS,
    getFilterOverrideArgs,
    parseFilterConfig,
    withGitHardeningEnv
} from '../git-hardening';

function scoped(...entries: [string, string, string][]): string {
    return entries.map(([scope, key, value]) => `${scope}\0${key}\n${value}\0`).join('');
}

function overridesFor(name: string): string[] {
    return [
        '-c', `filter.${name}.clean=`,
        '-c', `filter.${name}.smudge=`,
        '-c', `filter.${name}.process=`,
        '-c', `filter.${name}.required=false`
    ];
}

describe('GIT_HARDENING_ARGS', () => {
    it('turns off fsmonitor and refuses bare repositories found by discovery', () => {
        expect(GIT_HARDENING_ARGS).toEqual(['-c', 'core.fsmonitor=', '-c', 'safe.bareRepository=explicit']);
    });
});

describe('parseFilterConfig', () => {
    it('reads scoped entries, keeping dots in driver names', () => {
        expect(parseFilterConfig(scoped(
            ['local', 'filter.evil.clean', 'touch /tmp/x; cat'],
            ['global', 'filter.my.dotted.smudge', 'cat']
        ), true)).toEqual([
            { scope: 'local', name: 'evil', key: 'clean', value: 'touch /tmp/x; cat' },
            { scope: 'global', name: 'my.dotted', key: 'smudge', value: 'cat' }
        ]);
    });

    it('reads unscoped entries from a single-file lookup as local', () => {
        expect(parseFilterConfig('filter.evil.process\nrun-me\0', false)).toEqual([
            { scope: 'local', name: 'evil', key: 'process', value: 'run-me' }
        ]);
    });
});

describe('getFilterOverrideArgs', () => {
    it('turns off filters defined in the repository\'s own config', () => {
        const entries = parseFilterConfig(scoped(['local', 'filter.evil.clean', 'touch /tmp/x; cat']), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual(overridesFor('evil'));
    });

    it('treats worktree config like the repository\'s own', () => {
        const entries = parseFilterConfig(scoped(['worktree', 'filter.evil.process', 'run-me']), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual(overridesFor('evil'));
    });

    it('leaves filters from the user\'s global and system config alone', () => {
        const entries = parseFilterConfig(scoped(
            ['global', 'filter.mine.clean', 'my-tool clean'],
            ['system', 'filter.theirs.smudge', 'their-tool smudge']
        ), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual([]);
    });

    it('keeps Git LFS installed with --local', () => {
        const entries = parseFilterConfig(scoped(
            ['local', 'filter.lfs.clean', 'git-lfs clean -- %f'],
            ['local', 'filter.lfs.smudge', 'git-lfs smudge -- %f'],
            ['local', 'filter.lfs.process', 'git-lfs filter-process'],
            ['local', 'filter.lfs.required', 'true']
        ), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual([]);
    });

    it('turns off a local driver that changes any Git LFS command', () => {
        const entries = parseFilterConfig(scoped(
            ['global', 'filter.lfs.clean', 'git-lfs clean -- %f'],
            ['local', 'filter.lfs.process', 'git-lfs filter-process; touch /tmp/x']
        ), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual(overridesFor('lfs'));
    });

    it('keeps git-crypt when its program lives outside the repository', () => {
        const entries = parseFilterConfig(scoped(
            ['local', 'filter.git-crypt.clean', '"/usr/local/bin/git-crypt" clean'],
            ['local', 'filter.git-crypt.smudge', '"/usr/local/bin/git-crypt" smudge'],
            ['local', 'filter.git-crypt-work.clean', '"/opt/homebrew/bin/git-crypt" clean --key-name work']
        ), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual([]);
    });

    it.each([
        ['inside the repository', '"/repo/tools/git-crypt" clean'],
        ['given by a relative path', '"tools/git-crypt" clean'],
        ['with extra commands', '"/usr/local/bin/git-crypt" clean; touch /tmp/x'],
        ['under another name', '"/usr/local/bin/git-crypt-helper" clean']
    ])('turns off git-crypt %s', (_label, value) => {
        const entries = parseFilterConfig(scoped(['local', 'filter.git-crypt.clean', value]), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual(overridesFor('git-crypt'));
    });

    // nbstripout runs `python -m nbstripout`, and `python -m` imports from the
    // current directory first, so a repository could ship its own nbstripout.py.
    it('turns off nbstripout, which would import from the repository', () => {
        const entries = parseFilterConfig(scoped(['local', 'filter.nbstripout.clean', '"/usr/bin/python3" -m nbstripout']), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual(overridesFor('nbstripout'));
    });

    it('turns off each local driver once', () => {
        const entries = parseFilterConfig(scoped(
            ['local', 'filter.a.clean', 'x'],
            ['local', 'filter.a.smudge', 'y'],
            ['local', 'filter.b.process', 'z']
        ), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toEqual([...overridesFor('a'), ...overridesFor('b')]);
    });

    it('gives up when a local driver name can\'t be overridden on the command line', () => {
        const entries = parseFilterConfig(scoped(['local', 'filter.a=b.clean', 'x']), true);

        expect(getFilterOverrideArgs(entries, '/repo')).toBeNull();
    });
});

describe('withGitHardeningEnv', () => {
    it('passes the hardening config to git run by other programs', () => {
        expect(withGitHardeningEnv({ PATH: '/bin' })).toEqual({
            PATH: '/bin',
            GIT_CONFIG_COUNT: '2',
            GIT_CONFIG_KEY_0: 'core.fsmonitor',
            GIT_CONFIG_VALUE_0: '',
            GIT_CONFIG_KEY_1: 'safe.bareRepository',
            GIT_CONFIG_VALUE_1: 'explicit'
        });
    });

    it('appends after config the environment already carries', () => {
        expect(withGitHardeningEnv({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'me' })).toEqual({
            GIT_CONFIG_COUNT: '3',
            GIT_CONFIG_KEY_0: 'user.name',
            GIT_CONFIG_VALUE_0: 'me',
            GIT_CONFIG_KEY_1: 'core.fsmonitor',
            GIT_CONFIG_VALUE_1: '',
            GIT_CONFIG_KEY_2: 'safe.bareRepository',
            GIT_CONFIG_VALUE_2: 'explicit'
        });
    });
});
