import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';

export interface JjChangeCounts {
    insertions: number;
    deletions: number;
}

export function resolveJjCwd(context: RenderContext): string | undefined {
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

export function runJj(command: string, context: RenderContext): string | null {
    try {
        const cwd = resolveJjCwd(context);
        const output = execSync(`jj ${command}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            ...(cwd ? { cwd } : {})
        }).trim();

        return output.length > 0 ? output : null;
    } catch {
        return null;
    }
}

export function isInsideJjWorkspace(context: RenderContext): boolean {
    return runJj('workspace root', context) !== null;
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
    const stat = runJj('diff --stat', context) ?? '';

    return parseDiffStat(stat);
}