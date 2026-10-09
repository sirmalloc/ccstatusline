import * as fs from 'node:fs';
import * as path from 'node:path';

// On Windows, a program started by bare name is looked for in the current
// directory before PATH, and the status line runs in whatever directory the
// session is in: a git.exe shipped in a project folder would run instead of git.
// Elsewhere, names are only looked up on PATH.

export interface ExecutableLookup {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    isFile: (candidate: string) => boolean;
}

// What Windows itself runs without a shell, as Node and Bun spawn programs
const WINDOWS_EXECUTABLE_EXTENSIONS = ['.com', '.exe'];

const resolvedExecutables = new Map<string, string>();

function isFile(candidate: string): boolean {
    try {
        return fs.statSync(candidate).isFile();
    } catch {
        return false;
    }
}

const DEFAULT_LOOKUP: ExecutableLookup = {
    platform: process.platform,
    env: process.env,
    isFile
};

// Windows environment variable names ignore case, but a copied env object doesn't
function getPathValue(env: NodeJS.ProcessEnv): string {
    const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH');
    return key ? env[key] ?? '' : '';
}

function findOnWindowsPath(name: string, lookup: ExecutableLookup): string | null {
    const candidates = path.win32.extname(name)
        ? [name]
        : WINDOWS_EXECUTABLE_EXTENSIONS.map(extension => `${name}${extension}`);
    // Only absolute entries: ".", "" and relative ones all mean the current directory
    const directories = getPathValue(lookup.env)
        .split(';')
        .map(entry => entry.trim().replace(/^"(.*)"$/, '$1'))
        .filter(entry => path.win32.isAbsolute(entry) && !entry.startsWith('\\\\?'));

    for (const directory of directories) {
        for (const candidate of candidates) {
            const fullPath = path.win32.join(directory, candidate);
            if (lookup.isFile(fullPath)) {
                return fullPath;
            }
        }
    }

    return null;
}

/**
 * The program to run for `name`. On Windows, its full path from PATH, never
 * the current directory; throws when it isn't on PATH, so callers treat it as
 * unavailable. Elsewhere, and for a name that already has a directory, the name
 * unchanged.
 */
export function resolveExecutable(name: string, lookup: ExecutableLookup = DEFAULT_LOOKUP): string {
    if (lookup.platform !== 'win32' || /[\\/]/.test(name)) {
        return name;
    }

    const cached = lookup === DEFAULT_LOOKUP ? resolvedExecutables.get(name) : undefined;
    if (cached) {
        return cached;
    }

    const resolved = findOnWindowsPath(name, lookup);
    if (!resolved) {
        throw new Error(`${name} was not found on PATH`);
    }

    if (lookup === DEFAULT_LOOKUP) {
        resolvedExecutables.set(name, resolved);
    }
    return resolved;
}
