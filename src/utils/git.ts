import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';

export interface GitChangeCounts {
    insertions: number;
    deletions: number;
}

// Cache for git commands - key is "command|cwd"
const gitCommandCache = new Map<string, string | null>();

export function resolveGitCwd(context: RenderContext): string | undefined {
    const candidates = [
        context.data?.cwd,
        context.data?.workspace?.current_dir,
        context.data?.workspace?.project_dir
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate;
        }
    }

    return undefined;
}

export function runGit(command: string, context: RenderContext): string | null {
    const cwd = resolveGitCwd(context);
    const cacheKey = `${command}|${cwd ?? ''}`;

    // Check cache first
    if (gitCommandCache.has(cacheKey)) {
        return gitCommandCache.get(cacheKey) ?? null;
    }

    try {
        const output = execSync(`git ${command}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            ...(cwd ? { cwd } : {})
        }).trimEnd();

        const result = output.length > 0 ? output : null;
        gitCommandCache.set(cacheKey, result);
        return result;
    } catch {
        gitCommandCache.set(cacheKey, null);
        return null;
    }
}

/**
 * Clear git command cache - for testing only
 */
export function clearGitCache(): void {
    gitCommandCache.clear();
}

export function isInsideGitWorkTree(context: RenderContext): boolean {
    return runGit('rev-parse --is-inside-work-tree', context) === 'true';
}

function parseDiffShortStat(stat: string): GitChangeCounts {
    const insertMatch = /(\d+)\s+insertions?/.exec(stat);
    const deleteMatch = /(\d+)\s+deletions?/.exec(stat);

    return {
        insertions: insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0
    };
}

export function getGitChangeCounts(context: RenderContext): GitChangeCounts {
    const unstagedStat = runGit('diff --shortstat', context) ?? '';
    const stagedStat = runGit('diff --cached --shortstat', context) ?? '';
    const unstagedCounts = parseDiffShortStat(unstagedStat);
    const stagedCounts = parseDiffShortStat(stagedStat);

    return {
        insertions: unstagedCounts.insertions + stagedCounts.insertions,
        deletions: unstagedCounts.deletions + stagedCounts.deletions
    };
}

export interface GitStatus {
    staged: boolean;
    unstaged: boolean;
    untracked: boolean;
    conflicts: boolean;
}

export function getGitStatus(context: RenderContext): GitStatus {
    const output = runGit('--no-optional-locks status --porcelain -z', context);

    if (!output) {
        return { staged: false, unstaged: false, untracked: false, conflicts: false };
    }

    let staged = false;
    let unstaged = false;
    let untracked = false;
    let conflicts = false;

    const entries = output.split('\0');

    for (let index = 0; index < entries.length; index += 1) {
        const line = entries[index];
        if (typeof line !== 'string' || line.length < 2)
            continue;
        // Conflict detection: DD, AU, UD, UA, DU, AA, UU
        if (!conflicts && /^(DD|AU|UD|UA|DU|AA|UU)/.test(line))
            conflicts = true;
        if (!staged && /^[MADRCTU]/.test(line))
            staged = true;
        if (!unstaged && /^.[MADRCTU]/.test(line))
            unstaged = true;
        if (!untracked && line.startsWith('??'))
            untracked = true;
        if (staged && unstaged && untracked && conflicts)
            break;

        const indexStatus = line[0];
        if (indexStatus === 'R' || indexStatus === 'C') {
            index += 1;
        }
    }

    return { staged, unstaged, untracked, conflicts };
}

export interface GitAheadBehind {
    ahead: number;
    behind: number;
}

export function getGitAheadBehind(context: RenderContext): GitAheadBehind | null {
    const output = runGit('rev-list --left-right --count HEAD...@{upstream}', context);
    if (!output)
        return null;

    const parts = output.split(/\s+/);
    if (parts.length !== 2 || !parts[0] || !parts[1])
        return null;

    const ahead = parseInt(parts[0], 10);
    const behind = parseInt(parts[1], 10);

    if (isNaN(ahead) || isNaN(behind))
        return null;

    return { ahead, behind };
}

export function getGitConflictCount(context: RenderContext): number {
    const output = runGit('ls-files --unmerged', context);
    if (!output)
        return 0;

    // Count unique file paths (unmerged files appear 3 times in output)
    const files = new Set(output.split('\n').map((line) => {
        const parts = line.split(/\s+/).slice(3);
        return parts.join(' ');
    }).filter(path => path.length > 0));
    return files.size;
}

export function getGitShortSha(context: RenderContext): string | null {
    return runGit('rev-parse --short HEAD', context);
}