import { execFileSync } from 'child_process';
import {
    existsSync,
    statSync
} from 'fs';
import {
    dirname,
    join
} from 'path';

import type { RenderContext } from '../types/RenderContext';

import { resolveGitCwd } from './git';

export interface AtomicChangeCounts {
    insertions: number;
    deletions: number;
}

export function runAtomicArgs(args: string[], context: RenderContext, allowEmpty = false): string | null {
    try {
        const cwd = resolveGitCwd(context);
        const output = execFileSync('atomic', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true,
            ...(cwd ? { cwd } : {})
        }).trimEnd();

        return (allowEmpty || output.length > 0) ? output : null;
    } catch {
        return null;
    }
}

export function isInsideAtomicRepo(context: RenderContext): boolean {
    // `atomic status --short` exits 0 inside a repository (even when clean, with
    // empty output) and non-zero otherwise, so allow empty output here.
    return runAtomicArgs(['status', '--short'], context, true) !== null;
}

function parseDiffStat(stat: string): AtomicChangeCounts {
    const insertMatch = /(\d+)\s+insertions?/.exec(stat);
    const deleteMatch = /(\d+)\s+deletions?/.exec(stat);

    return {
        insertions: insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0
    };
}

export function getAtomicChangeCounts(context: RenderContext): AtomicChangeCounts {
    return parseDiffStat(runAtomicArgs(['diff', '--stat'], context) ?? '');
}

// Atomic has no `root` subcommand, so walk up from the working directory looking
// for a `.atomic` directory, mirroring how git/jj resolve their repository root.
export function findAtomicRoot(context: RenderContext): string | null {
    let current = resolveGitCwd(context) ?? process.cwd();

    for (let parent = dirname(current); ; parent = dirname(current)) {
        const marker = join(current, '.atomic');
        try {
            if (existsSync(marker) && statSync(marker).isDirectory()) {
                return current;
            }
        } catch {
            // Ignore filesystem errors and keep walking upward.
        }

        if (parent === current) {
            return null;
        }
        current = parent;
    }
}
