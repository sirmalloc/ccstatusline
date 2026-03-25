import { readFileSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';

import type { RenderContext } from '../types/RenderContext';

import { runGit } from './git';

const TASK_DIR = join(homedir(), '.cache', 'ccstatusline', 'tasks');

function getTaskFromFile(sessionId: string): string | null {
    try {
        const content = readFileSync(join(TASK_DIR, `claude-task-${sessionId}`), 'utf8').trim();
        if (!content) return null;
        try {
            const data = JSON.parse(content) as { task?: string };
            return data.task ?? null;
        } catch {
            return content.split('\n')[0] ?? null;
        }
    } catch {
        return null;
    }
}

/**
 * Resolve a terminal title template string.
 *
 * Supported placeholders:
 *   {task}   - task objective from the session task file
 *   {repo}   - git repository name
 *   {branch} - current git branch
 *   {model}  - model display name
 *   {dir}    - current working directory basename
 *
 * Segments separated by ' | ' are dropped if all their placeholders resolved
 * to empty, so "Task: {task} | {repo}/{branch}" gracefully falls back to
 * just "{repo}/{branch}" when no task is set.
 */
export function resolveTerminalTitle(template: string, context: RenderContext): string | null {
    const sessionId = context.data?.session_id;
    const task = sessionId ? getTaskFromFile(sessionId) : null;
    const branch = runGit('branch --show-current', context);
    const repoPath = runGit('rev-parse --show-toplevel', context);
    const repo = repoPath ? basename(repoPath) : null;
    const model = typeof context.data?.model === 'string'
        ? context.data.model
        : context.data?.model?.display_name ?? null;
    const dir = context.data?.workspace?.current_dir
        ? basename(context.data.workspace.current_dir)
        : null;

    const vars: Record<string, string | null> = {
        task, repo, branch, model, dir
    };

    // Split by ' | ' segments, resolve each, drop empty segments
    const segments = template.split(' | ').map(segment => {
        const resolved = segment.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
        // If the segment is empty after resolving (all placeholders were empty), skip it
        return resolved.trim();
    }).filter(s => s.length > 0);

    if (segments.length === 0) return null;
    return segments.join(' | ');
}
