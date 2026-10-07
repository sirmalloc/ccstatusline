import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RenderContext } from '../types/RenderContext';

import {
    getCommandCachePath,
    getGitCacheTtlMs,
    getMtimeMs,
    normalizeDirectory,
    resolveGitCwd,
    runCachedCommand,
    type GitRepoMetadata
} from './git';

export interface JjChangeCounts {
    insertions: number;
    deletions: number;
}

// jj locates its workspace by walking up from the cwd to the nearest `.jj`
// directory, so a failed walk means `jj root` would fail too and we can skip
// spawning it.
function findJjDir(startDir: string): string | null {
    let current = startDir;

    for (;;) {
        const jjDir = path.join(current, '.jj');
        try {
            if (fs.statSync(jjDir).isDirectory()) {
                return jjDir;
            }
        } catch {
            // Keep walking up.
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

// Secondary workspaces (`jj workspace add`) store the path of the shared repo
// in a `.jj/repo` file instead of a directory.
function resolveJjRepoDir(jjDir: string): string {
    const repoPath = path.join(jjDir, 'repo');
    try {
        if (fs.statSync(repoPath).isFile()) {
            return path.resolve(jjDir, fs.readFileSync(repoPath, 'utf-8').trim());
        }
    } catch {
        // Fall through to the default layout.
    }

    return repoPath;
}

// Every jj operation (including a working-copy snapshot) adds a new op head
// and rewrites this workspace's checkout file, so their mtimes invalidate
// cached output the same way .git/HEAD and .git/index do for git.
function getJjRepoMetadata(jjDir: string): GitRepoMetadata {
    return {
        cachePath: getCommandCachePath('jj', jjDir),
        headMtimeMs: getMtimeMs(path.join(resolveJjRepoDir(jjDir), 'op_heads', 'heads')),
        indexMtimeMs: getMtimeMs(path.join(jjDir, 'working_copy', 'checkout'))
    };
}

function findJjDirForCwd(cwd: string | undefined): string | null {
    const startDir = normalizeDirectory(cwd ?? process.cwd());
    return startDir ? findJjDir(startDir) : null;
}

// Read-only queries whose output does not depend on uncommitted file edits
// (change id, description, bookmarks, workspace name) pass
// --ignore-working-copy to skip the working-copy snapshot; `jj diff` keeps
// snapshotting because the snapshot is the data it reports.
export function runJjArgs(args: string[], context: RenderContext, allowEmpty = false): string | null {
    const cwd = resolveGitCwd(context);
    const jjDir = cwd ? findJjDirForCwd(cwd) : null;
    // `jj root` never snapshots; any other command without
    // --ignore-working-copy may record a snapshot operation while it runs.
    const maySnapshot = args[0] !== 'root' && !args.includes('--ignore-working-copy');

    return runCachedCommand({
        file: 'jj',
        args,
        cacheToken: `${args.join('\0')}${allowEmpty ? '\0allow-empty' : ''}`,
        cwd,
        metadata: jjDir ? getJjRepoMetadata(jjDir) : null,
        ttlMs: getGitCacheTtlMs(context),
        allowEmpty,
        ...(jjDir && maySnapshot ? { refreshMetadata: () => getJjRepoMetadata(jjDir) } : {})
    });
}

export function isInsideJjRepo(context: RenderContext): boolean {
    if (!findJjDirForCwd(resolveGitCwd(context))) {
        return false;
    }

    return runJjArgs(['root'], context) !== null;
}

function parseDiffStat(stat: string): JjChangeCounts {
    const insertMatch = /(\d+)\s+insertions?/.exec(stat);
    const deleteMatch = /(\d+)\s+deletions?/.exec(stat);

    return {
        insertions: insertMatch?.[1] ? Number.parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch?.[1] ? Number.parseInt(deleteMatch[1], 10) : 0
    };
}

export function getJjChangeCounts(context: RenderContext): JjChangeCounts {
    return parseDiffStat(runJjArgs(['diff', '--stat'], context) ?? '');
}
