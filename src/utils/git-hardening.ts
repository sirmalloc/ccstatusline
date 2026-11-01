import * as path from 'node:path';

// A repository's own config can make git run programs: core.fsmonitor on any
// command that reads the work tree, and filter drivers when status or diff
// re-reads a changed file. The status line runs git wherever the session's
// directory is, including inside a project just downloaded, so it must not run
// what that project's .git/config asks for.
//
// These turn off fsmonitor (an empty value means "off" to every git version)
// and stop git from using a bare repository it found by searching upward,
// which could otherwise set any of this from inside a project folder.
export const GIT_HARDENING_ARGS = ['-c', 'core.fsmonitor=', '-c', 'safe.bareRepository=explicit'];

const GIT_HARDENING_CONFIG: [string, string][] = [
    ['core.fsmonitor', ''],
    ['safe.bareRepository', 'explicit']
];

export interface FilterConfigEntry {
    scope: string;
    name: string;
    key: string;
    value: string;
}

// Scopes the repository itself controls; global and system config are the user's
const REPOSITORY_SCOPES = new Set(['local', 'worktree']);
const FILTER_COMMAND_KEYS = new Set(['clean', 'smudge', 'process']);

const GIT_LFS_COMMANDS: Record<string, string> = {
    clean: 'git-lfs clean -- %f',
    smudge: 'git-lfs smudge -- %f',
    process: 'git-lfs filter-process'
};

// git-crypt writes its own absolute path, quoted, followed by clean or smudge and
// an optional key name. Only path characters are allowed, since git runs the
// command through a shell.
const GIT_CRYPT_COMMAND = /^(?:"([\w./\\:+@ -]+)"|([\w./\\:+@-]+)) (clean|smudge)(?: --key-name [\w-]+)?$/;

function isAbsolutePath(candidate: string): boolean {
    return candidate.startsWith('/') || /^[A-Za-z]:[\\/]/.test(candidate);
}

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isGitCryptCommand(key: string, value: string, repoRoot: string): boolean {
    const match = GIT_CRYPT_COMMAND.exec(value);
    const program = match?.[1] ?? match?.[2];
    if (!program || match?.[3] !== key) {
        return false;
    }

    const name = program.split(/[\\/]/).pop();
    return (name === 'git-crypt' || name === 'git-crypt.exe')
        && isAbsolutePath(program)
        && !isInside(program, repoRoot);
}

// Filters that tools install into a repository's own config, kept running so
// their files don't all show as changed. nbstripout isn't here: it runs
// `python -m nbstripout`, which imports from the repository folder first.
function isKnownFilterCommand(key: string, value: string, repoRoot: string): boolean {
    return GIT_LFS_COMMANDS[key] === value || isGitCryptCommand(key, value, repoRoot);
}

// `git config -z --get-regexp` output: `<key>\n<value>\0` per entry, each
// preceded by `<scope>\0` with --show-scope. Lookups of a single file
// (--local, --worktree) have no scope, and count as the repository's own.
export function parseFilterConfig(output: string, scoped: boolean): FilterConfigEntry[] {
    const fields = output.split('\0');
    const entries: FilterConfigEntry[] = [];
    const step = scoped ? 2 : 1;

    for (let i = 0; i + step - 1 < fields.length; i += step) {
        const scope = scoped ? fields[i] : 'local';
        const keyValue = fields[i + step - 1];
        if (!scope || !keyValue) {
            continue;
        }

        const newline = keyValue.indexOf('\n');
        const fullKey = newline === -1 ? keyValue : keyValue.slice(0, newline);
        const value = newline === -1 ? '' : keyValue.slice(newline + 1);
        const lastDot = fullKey.lastIndexOf('.');
        if (!fullKey.startsWith('filter.') || lastDot <= 'filter.'.length) {
            continue;
        }

        entries.push({
            scope,
            name: fullKey.slice('filter.'.length, lastDot),
            key: fullKey.slice(lastDot + 1),
            value
        });
    }

    return entries;
}

/**
 * `-c` arguments that turn off every filter driver the repository's own config
 * defines, other than known tools' standard commands. null when a driver name
 * can't be overridden with `-c` (it contains `=`), so the caller can skip the
 * command instead.
 */
export function getFilterOverrideArgs(entries: FilterConfigEntry[], repoRoot: string): string[] | null {
    const names: string[] = [];

    for (const entry of entries) {
        if (!REPOSITORY_SCOPES.has(entry.scope) || !FILTER_COMMAND_KEYS.has(entry.key)) {
            continue;
        }
        if (isKnownFilterCommand(entry.key, entry.value, repoRoot) || names.includes(entry.name)) {
            continue;
        }
        names.push(entry.name);
    }

    if (names.some(name => name.includes('='))) {
        return null;
    }

    return names.flatMap(name => [
        '-c', `filter.${name}.clean=`,
        '-c', `filter.${name}.smudge=`,
        '-c', `filter.${name}.process=`,
        '-c', `filter.${name}.required=false`
    ]);
}

/**
 * The same hardening for git that other programs run (gh, glab), passed as
 * GIT_CONFIG_COUNT entries after any the environment already has.
 */
export function withGitHardeningEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const existing = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10);
    const start = Number.isNaN(existing) || existing < 0 ? 0 : existing;
    const hardened: NodeJS.ProcessEnv = { ...env };

    GIT_HARDENING_CONFIG.forEach(([key, value], offset) => {
        hardened[`GIT_CONFIG_KEY_${start + offset}`] = key;
        hardened[`GIT_CONFIG_VALUE_${start + offset}`] = value;
    });
    hardened.GIT_CONFIG_COUNT = String(start + GIT_HARDENING_CONFIG.length);

    return hardened;
}
