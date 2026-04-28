import { execFileSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';

import { resolveGitCwd } from './git';

export function runJjArgs(args: string[], context: RenderContext): string | null {
    try {
        const cwd = resolveGitCwd(context);
        const output = execFileSync('jj', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            ...(cwd ? { cwd } : {})
        }).trimEnd();

        return output.length > 0 ? output : null;
    } catch {
        return null;
    }
}

export function isInsideJjRepo(context: RenderContext): boolean {
    return runJjArgs(['root'], context) !== null;
}
