import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import { resolveGitCwd } from './git';

export function runJj(command: string, context: RenderContext): string | null {
    try {
        const cwd = resolveGitCwd(context);
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

export function isInsideJjRepo(context: RenderContext): boolean {
    return runJj('root', context) !== null;
}
