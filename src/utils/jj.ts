import { execFileSync } from 'node:child_process';

import type { RenderContext } from '../types/RenderContext';

import { resolveExecutable } from './executable-path';
import { resolveGitCwd } from './git';

// Same as git's: a jj call that blocks (a held working-copy lock, a slow
// snapshot) must not hold up the status line
const JJ_COMMAND_TIMEOUT_MS = 5_000;

// Also git's: past execFileSync's 1 MiB default, `jj diff --stat` on a large
// change set would fail
const JJ_COMMAND_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export interface JjChangeCounts {
    insertions: number;
    deletions: number;
}

export function runJjArgs(args: string[], context: RenderContext, allowEmpty = false): string | null {
    try {
        const cwd = resolveGitCwd(context);
        // ui.color = "always" in the user's jj config colors jj's output even
        // into a pipe, and its codes would override the widget's own colors
        const output = execFileSync(resolveExecutable('jj'), ['--color=never', ...args], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: JJ_COMMAND_TIMEOUT_MS,
            maxBuffer: JJ_COMMAND_MAX_BUFFER_BYTES,
            windowsHide: true,
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
    const summaryLine = stat.split('\n').pop() ?? '';
    const insertMatch = /(\d+)\s+insertions?/.exec(summaryLine);
    const deleteMatch = /(\d+)\s+deletions?/.exec(summaryLine);

    return {
        insertions: insertMatch?.[1] ? Number.parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch?.[1] ? Number.parseInt(deleteMatch[1], 10) : 0
    };
}

// null when `jj diff --stat` fails (a stale working copy, a slow snapshot),
// which says nothing about the changes
export function getJjChangeCounts(context: RenderContext): JjChangeCounts | null {
    const stat = runJjArgs(['diff', '--stat'], context, true);
    return stat === null ? null : parseDiffStat(stat);
}
