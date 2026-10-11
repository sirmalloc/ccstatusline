import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';
import {
    execFile,
    execFileSync
} from 'node:child_process';
import { promisify } from 'util';

// Promise-based execFile with string decoding (see usage-fetch.ts for the shape).
const execFileAsync = promisify(execFile) as (
    file: string,
    args: readonly string[],
    options: ExecFileOptionsWithStringEncoding
) => Promise<{ stdout: string; stderr: string }>;

import { capMap } from '../daemon/provider-scope';
import type { RenderContext } from '../types/RenderContext';

import { resolveExecutable } from './executable-path';
import { resolveGitCwd } from './git';

// Same as git's: a jj call that blocks (a held working-copy lock, a slow
// snapshot) must not hold up the status line
const JJ_COMMAND_TIMEOUT_MS = 5_000;

export interface JjChangeCounts {
    insertions: number;
    deletions: number;
}

// Commands each cwd actually executed, for the daemon prefetch (#18) — the
// async twin warms nothing the sync path reads (jj results are not cached),
// so instead the prefetch re-runs recorded commands and the sync formatter
// simply never runs on the daemon path once prefetch coverage exists.
const executedJjCommands = new Map<string, string[][]>();

function recordExecutedJjCommand(cwd: string, args: string[]): void {
    const commands = executedJjCommands.get(cwd) ?? [];
    if (!commands.some(existing => existing.join('\0') === args.join('\0'))) {
        commands.push(args);
    }
    executedJjCommands.set(cwd, commands.slice(-64));
    capMap(executedJjCommands, 32);
}

export function runJjArgs(args: string[], context: RenderContext, allowEmpty = false): string | null {
    try {
        const cwd = resolveGitCwd(context);
        const output = execFileSync(resolveExecutable('jj'), args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: JJ_COMMAND_TIMEOUT_MS,
            ...(context.env ? { env: context.env } : {}),
            windowsHide: true,
            ...(cwd ? { cwd } : {})
        }).trimEnd();

        const result = (allowEmpty || output.length > 0) ? output : null;
        if (cwd) {
            recordExecutedJjCommand(cwd, args);
        }
        return result;
    } catch {
        return null;
    }
}

/**
 * Async twin of runJjArgs for the daemon prefetch (#18): non-blocking child
 * process, same cwd/env resolution, same trim/empty semantics.
 */
export async function runJjArgsAsync(args: string[], context: RenderContext, allowEmpty = false): Promise<string | null> {
    try {
        const cwd = resolveGitCwd(context);
        const execOptions: ExecFileOptionsWithStringEncoding = {
            encoding: 'utf8',
            maxBuffer: 8 * 1024 * 1024,
            env: context.env ?? process.env,
            timeout: JJ_COMMAND_TIMEOUT_MS,
            killSignal: 'SIGKILL',
            windowsHide: true,
            ...(cwd ? { cwd } : {})
        };
        const output = (await execFileAsync('jj', args, execOptions)).stdout.trimEnd();

        const result = (allowEmpty || output.length > 0) ? output : null;
        if (cwd) {
            recordExecutedJjCommand(cwd, args);
        }
        return result;
    } catch {
        return null;
    }
}

/** Commands previously executed for `cwd`, for the daemon prefetch (#18). */
export function getExecutedJjCommands(cwd: string): string[][] {
    return [...(executedJjCommands.get(cwd) ?? [])];
}

export function clearJjCommandLog(): void {
    executedJjCommands.clear();
}

export function isInsideJjRepo(context: RenderContext): boolean {
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
