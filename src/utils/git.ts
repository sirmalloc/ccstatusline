import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';

export interface GitChangeCounts {
    insertions: number;
    deletions: number;
}

export interface GitFileStatusCounts {
    staged: number;
    unstaged: number;
    untracked: number;
}

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
    try {
        const cwd = resolveGitCwd(context);
        const output = execSync(`git ${command}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            ...(cwd ? { cwd } : {})
        }).trim();

        return output.length > 0 ? output : null;
    } catch {
        return null;
    }
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

function countOutputLines(output: string | null): number {
    if (!output) {
        return 0;
    }

    return output.split('\n').filter(line => line.length > 0).length;
}

export function getGitFileStatusCounts(context: RenderContext): GitFileStatusCounts {
    const staged = countOutputLines(runGit('diff --cached --name-only', context));
    const unstaged = countOutputLines(runGit('diff --name-only', context));
    const untracked = countOutputLines(runGit('ls-files --others --exclude-standard', context));

    return {
        staged,
        unstaged,
        untracked
    };
}