import { readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const TASK_DIR = join(homedir(), '.cache', 'ccstatusline', 'tasks');
const TASK_FILE_PREFIX = 'claude-task-';

// Status indicators shown as emoji prefixes
const STATUS_INDICATORS: Record<string, string> = {
    'in_progress': '\u{1F504}',  // 🔄
    'complete':    '\u2705',     // ✅
    'failed':     '\u274C',     // ❌
    'blocked':    '\u{1F6D1}',  // 🛑
    'paused':     '\u23F8\uFE0F', // ⏸️
    'reviewing':  '\u{1F50D}',  // 🔍
};

interface TaskFileData {
    task: string | null;
    status: string | null;
}

interface TaskState {
    task: string;
    startedAt: number;
}

// In-memory tracking of when each task started, keyed by session ID.
// The timer resets when the task text changes (new task).
const taskStartTimes = new Map<string, TaskState>();

function formatElapsed(ms: number): string {
    if (ms < 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function getTaskDir(): string {
    return TASK_DIR;
}

function getTaskFilePath(sessionId: string): string {
    return join(TASK_DIR, `${TASK_FILE_PREFIX}${sessionId}`);
}

function readTaskFile(sessionId: string): TaskFileData {
    const filePath = getTaskFilePath(sessionId);
    try {
        const content = readFileSync(filePath, 'utf8').trim();
        if (!content) return { task: null, status: null };

        try {
            const data = JSON.parse(content) as { task?: string; status?: string };
            return { task: data.task ?? null, status: data.status ?? null };
        } catch {
            return { task: content.split('\n')[0] ?? null, status: null };
        }
    } catch {
        return { task: null, status: null };
    }
}

/**
 * Track task start time in memory. Returns elapsed ms since the current
 * task started. The timer resets when the task text changes (new task).
 */
function getElapsedMs(sessionId: string, task: string): number {
    const existing = taskStartTimes.get(sessionId);
    if (existing && existing.task === task) {
        return Date.now() - existing.startedAt;
    }
    // New task or first time seeing this session — start the clock.
    // Use the file's mtime as the start time so we pick up tasks that
    // were written before this ccstatusline process started.
    let startedAt = Date.now();
    try {
        const filePath = getTaskFilePath(sessionId);
        startedAt = statSync(filePath).mtimeMs;
    } catch {
        // Fall back to now
    }
    taskStartTimes.set(sessionId, { task, startedAt });
    return Date.now() - startedAt;
}

export class TaskObjectiveWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Displays the current task objective from a session-keyed file'; }
    getDisplayName(): string { return 'Task Objective'; }
    getCategory(): string { return 'Core'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];
        if (item.maxWidth) {
            modifiers.push(`max:${item.maxWidth}`);
        }
        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue
                ? `${STATUS_INDICATORS['in_progress']} Implement auth flow (3m)`
                : `Task: ${STATUS_INDICATORS['in_progress']} Implement auth flow (3m)`;
        }

        const sessionId = context.data?.session_id;
        if (!sessionId) return null;

        const { task, status } = readTaskFile(sessionId);
        if (!task) return null;

        const indicator = STATUS_INDICATORS[status ?? 'in_progress'] ?? '';
        const prefix = indicator ? `${indicator} ` : '';

        const showElapsed = item.metadata?.showElapsed !== 'false';
        const elapsedMs = getElapsedMs(sessionId, task);
        const suffix = showElapsed ? ` (${formatElapsed(elapsedMs)})` : '';

        let display = item.rawValue
            ? `${prefix}${task}${suffix}`
            : `Task: ${prefix}${task}${suffix}`;

        if (item.maxWidth && display.length > item.maxWidth) {
            display = display.substring(0, item.maxWidth - 3) + '...';
        }

        return display;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'w', label: '(w)idth', action: 'edit-width' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
