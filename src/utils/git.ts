import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';

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