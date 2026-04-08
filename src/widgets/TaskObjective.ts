import { readFileSync, statSync, writeFileSync } from 'fs';
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

// Terminal statuses — elapsed time freezes when the task reaches one of these
const TERMINAL_STATUSES = new Set(['complete', 'failed']);

interface TaskFileData {
    task: string | null;
    status: string | null;
}

interface SidecarData {
    task: string;
    startedAt: number;
    frozenElapsedMs?: number;
}

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
 * Get elapsed ms since the current task started.
 *
 * Persists the start time in a sidecar file (<task-file>.started) so it
 * survives across ccstatusline process restarts (ccstatusline launches as
 * a fresh process per render). The sidecar stores the task text and a
 * timestamp; if the task text changes, the timer resets.
 *
 * When the task reaches a terminal status (complete, failed), the elapsed
 * time is frozen — subsequent renders show the same duration.
 */
function getElapsedMs(sessionId: string, task: string, status: string | null): number {
    const sidecarPath = getTaskFilePath(sessionId) + '.started';

    // Check for existing sidecar
    let sidecar: SidecarData | null = null;
    try {
        const content = readFileSync(sidecarPath, 'utf8').trim();
        const data = JSON.parse(content) as SidecarData;
        if (data.task === task && typeof data.startedAt === 'number') {
            sidecar = data;
        }
    } catch {
        // No sidecar or invalid — will create one below
    }

    if (sidecar) {
        // If already frozen, return the frozen value
        if (typeof sidecar.frozenElapsedMs === 'number') {
            return sidecar.frozenElapsedMs;
        }

        const elapsed = Date.now() - sidecar.startedAt;

        // Freeze if we just reached a terminal status
        if (status && TERMINAL_STATUSES.has(status)) {
            try {
                writeFileSync(sidecarPath, JSON.stringify({
                    ...sidecar,
                    frozenElapsedMs: elapsed
                }), 'utf8');
            } catch { /* non-fatal */ }
        }

        return elapsed;
    }

    // New task or first sighting — use the task file's birthtime if
    // available (creation time), falling back to mtime, then now.
    let startedAt = Date.now();
    try {
        const stats = statSync(getTaskFilePath(sessionId));
        // birthtimeMs is 0 on filesystems that don't support it
        startedAt = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs;
    } catch {
        // Fall back to now
    }

    const newSidecar: SidecarData = { task, startedAt };
    const elapsed = Date.now() - startedAt;

    // If already terminal on first sighting, freeze immediately
    if (status && TERMINAL_STATUSES.has(status)) {
        newSidecar.frozenElapsedMs = elapsed;
    }

    try {
        writeFileSync(sidecarPath, JSON.stringify(newSidecar), 'utf8');
    } catch { /* non-fatal */ }

    return elapsed;
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
        const elapsedMs = getElapsedMs(sessionId, task, status);
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
