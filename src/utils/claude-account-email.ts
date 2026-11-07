import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getClaudeJsonPath } from './claude-settings';

const CACHE_SCHEMA_VERSION = 1 as const;

interface ClaudeJson { oauthAccount?: { emailAddress?: string } }

interface AccountEmailCacheEntry {
    version: typeof CACHE_SCHEMA_VERSION;
    path: string;
    size: number;
    mtimeMs: number;
    email: string | null;
}

export interface AccountEmailDeps {
    statSync: (path: string) => { size: number; mtimeMs: number };
    readFileSync: (path: string) => string;
    writeFileSync: (path: string, data: string) => void;
    renameSync: (from: string, to: string) => void;
    mkdirSync: (path: string) => void;
    getClaudeJsonPath: () => string;
    getCachePath: () => string;
}

const defaultDeps: AccountEmailDeps = {
    statSync: (p: string) => fs.statSync(p),
    readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
    writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, { encoding: 'utf-8', mode: 0o600 }); },
    renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
    mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
    getClaudeJsonPath,
    // Resolved per call (not at import) so a changed/mocked home is honoured.
    getCachePath: () => path.join(os.homedir(), '.cache', 'ccstatusline', 'claude-account-email.json')
};

function readCacheEntry(deps: AccountEmailDeps): AccountEmailCacheEntry | null {
    try {
        const parsed = JSON.parse(deps.readFileSync(deps.getCachePath())) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const entry = parsed as Record<string, unknown>;
        if (entry.version !== CACHE_SCHEMA_VERSION
            || typeof entry.path !== 'string'
            || typeof entry.size !== 'number'
            || typeof entry.mtimeMs !== 'number'
            || (typeof entry.email !== 'string' && entry.email !== null)) {
            return null;
        }

        return entry as unknown as AccountEmailCacheEntry;
    } catch {
        // Missing or corrupt cache is a miss, never a failure.
        return null;
    }
}

function writeCacheEntry(entry: AccountEmailCacheEntry, deps: AccountEmailDeps): void {
    try {
        const cachePath = deps.getCachePath();
        deps.mkdirSync(path.dirname(cachePath));
        const tempPath = `${cachePath}.${process.pid}.tmp`;
        deps.writeFileSync(tempPath, JSON.stringify(entry));
        deps.renameSync(tempPath, cachePath);
    } catch {
        // Best-effort cache; the statusline must render regardless.
    }
}

/**
 * Returns the logged-in account email from `.claude.json`, or null when it is
 * missing, empty, not a string, or the file is absent/unparseable.
 *
 * `.claude.json` also holds Claude Code's per-project history, so it can grow
 * to megabytes and parsing it on every render is the dominant cost of the
 * widget. The extracted email is therefore cached keyed on the file's
 * path + size + mtime, and the file is only re-read when one of those changes.
 * Stat happens before the read, so a write that lands in between leaves a key
 * older than the content and simply causes one extra re-read next time.
 * Parse failures are not cached, so they are retried on every render as before.
 */
export function getClaudeAccountEmail(deps: AccountEmailDeps = defaultDeps): string | null {
    const claudeJsonPath = deps.getClaudeJsonPath();

    let stat: { size: number; mtimeMs: number };
    try {
        stat = deps.statSync(claudeJsonPath);
    } catch {
        return null;
    }

    const cached = readCacheEntry(deps);
    if (cached?.path === claudeJsonPath
        && cached.size === stat.size
        && cached.mtimeMs === stat.mtimeMs) {
        return cached.email;
    }

    let email: string | null;
    try {
        const data = JSON.parse(deps.readFileSync(claudeJsonPath)) as ClaudeJson;
        const value = data.oauthAccount?.emailAddress;
        email = typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
        return null;
    }

    writeCacheEntry({
        version: CACHE_SCHEMA_VERSION,
        path: claudeJsonPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        email
    }, deps);

    return email;
}
