import { execFileSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';

import { resolveGitCwd } from './git';

export interface JjChangeCounts {
    insertions: number;
    deletions: number;
}

export function runJjArgs(args: string[], context: RenderContext, allowEmpty = false): string | null {
    try {
        const cwd = resolveGitCwd(context);
        const output = execFileSync('jj', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            ...(cwd ? { cwd } : {})
        }).trimEnd();

        return (allowEmpty || output.length > 0) ? output : null;
    } catch {
        return null;
    }
}

export function isInsideJjRepo(context: RenderContext): boolean {
    return runJjArgs(['root'], context) !== null;
}

function parseDiffStat(stat: string): JjChangeCounts {
    const insertMatch = /(\d+)\s+insertions?/.exec(stat);
    const deleteMatch = /(\d+)\s+deletions?/.exec(stat);

    return {
        insertions: insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0
    };
}

export function getJjChangeCounts(context: RenderContext): JjChangeCounts {
    return parseDiffStat(runJjArgs(['diff', '--stat'], context) ?? '');
}
