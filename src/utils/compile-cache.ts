import * as fs from 'fs';
import nodeModule from 'module';
import * as os from 'os';
import * as path from 'path';

// __PACKAGE_VERSION__ is replaced at build time (scripts/replace-version.ts)
const PACKAGE_VERSION = '__PACKAGE_VERSION__';

type EnableCompileCache = (directory?: string) => unknown;

export interface CompileCacheDeps {
    enable: EnableCompileCache | undefined;
    isBun: boolean;
    homedir: () => string;
    version: string;
}

const defaultDeps: CompileCacheDeps = {
    enable: (nodeModule as { enableCompileCache?: EnableCompileCache }).enableCompileCache,
    isBun: typeof process.versions.bun === 'string',
    homedir: () => os.homedir(),
    version: PACKAGE_VERSION
};

function parseVersion(version: string): number[] | null {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    return match ? match.slice(1).map(Number) : null;
}

function isOlderVersion(candidate: number[], current: number[]): boolean {
    for (let i = 0; i < current.length; i++) {
        const a = candidate[i] ?? 0;
        const b = current[i] ?? 0;
        if (a !== b) {
            return a < b;
        }
    }
    return false;
}

// Bundled chunk names carry content hashes, so every release compiles into
// fresh cache entries that Node never prunes. Keep one directory per release
// and drop the directories of older releases. Newer ones are left alone so two
// installs of different versions never keep evicting each other.
export function pruneOlderCompileCaches(root: string, version: string): void {
    const current = parseVersion(version);
    if (!current) {
        return;
    }

    for (const entry of fs.readdirSync(root)) {
        const candidate = parseVersion(entry);
        if (candidate && isOlderVersion(candidate, current)) {
            fs.rmSync(path.join(root, entry), { recursive: true, force: true });
        }
    }
}

/**
 * Turns on Node's on-disk V8 compile cache (Node >= 22.1) so later runs skip
 * re-parsing and compiling the bundled chunks. Must run before those chunks
 * are imported. A no-op on Bun and on older Node versions.
 *
 * NODE_DISABLE_COMPILE_CACHE=1 opts out; an explicit NODE_COMPILE_CACHE
 * directory takes precedence, because Node enables it before this code runs.
 */
export function enableCompileCache(deps: CompileCacheDeps = defaultDeps): void {
    if (typeof deps.enable !== 'function' || deps.isBun) {
        return;
    }

    try {
        const root = path.join(deps.homedir(), '.cache', 'ccstatusline', 'compile-cache');
        const directory = path.join(root, deps.version);
        if (!fs.existsSync(directory)) {
            // First run of this release: clean up after the previous ones
            try {
                pruneOlderCompileCaches(root, deps.version);
            } catch {
                // Nothing to prune yet
            }
        }
        // Failures (e.g. a read-only home) are reported through the returned
        // status rather than thrown; the cache is only an optimisation.
        deps.enable(directory);
    } catch {
        // Never let the cache get in the way of rendering
    }
}
