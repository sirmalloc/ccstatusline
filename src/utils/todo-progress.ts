import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
    TodoItem,
    TodoProgressMetrics,
    TodoStatus
} from '../types/TodoProgressMetrics';

function getTodoProgressDir(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'todo-progress');
}

export function getTodoProgressFilePath(sessionId: string): string {
    return path.join(getTodoProgressDir(), `todo-progress-${sessionId}.jsonl`);
}

function isTodoStatus(value: unknown): value is TodoStatus {
    return value === 'pending' || value === 'in_progress' || value === 'completed';
}

function normalizeTodo(entry: unknown): TodoItem | null {
    if (typeof entry !== 'object' || entry === null) {
        return null;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.content !== 'string') {
        return null;
    }
    if (!isTodoStatus(record.status)) {
        return null;
    }
    const item: TodoItem = {
        content: record.content,
        status: record.status
    };
    if (typeof record.activeForm === 'string') {
        item.activeForm = record.activeForm;
    }
    return item;
}

function extractTurnTimestamp(line: string, sessionId: string): string | null {
    try {
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        const record = parsed as Record<string, unknown>;
        if (record.event !== 'turn')
            return null;
        if (record.session_id !== sessionId)
            return null;
        if (typeof record.timestamp !== 'string')
            return null;
        return record.timestamp;
    } catch {
        return null;
    }
}

function parseSnapshot(line: string, sessionId: string): TodoProgressMetrics | null {
    try {
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const record = parsed as Record<string, unknown>;
        if (typeof record.timestamp !== 'string') {
            return null;
        }
        if (record.session_id !== sessionId) {
            return null;
        }
        if (!Array.isArray(record.todos)) {
            return null;
        }
        const todos: TodoItem[] = [];
        for (const raw of record.todos) {
            const normalized = normalizeTodo(raw);
            if (normalized !== null) {
                todos.push(normalized);
            }
        }
        return { todos, timestamp: record.timestamp };
    } catch {
        return null;
    }
}

export function getTodoProgressMetrics(sessionId: string): TodoProgressMetrics {
    const filePath = getTodoProgressFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return { todos: [], timestamp: null };
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        let lastTurnMs = 0;
        let lastSnapshot: TodoProgressMetrics | null = null;

        for (const line of lines) {
            const turnTs = extractTurnTimestamp(line, sessionId);
            if (turnTs !== null) {
                const ms = new Date(turnTs).getTime();
                if (!Number.isNaN(ms) && ms > lastTurnMs) {
                    lastTurnMs = ms;
                }
                continue;
            }
            const snapshot = parseSnapshot(line, sessionId);
            if (snapshot !== null) {
                lastSnapshot = snapshot;
            }
        }

        if (lastSnapshot === null) {
            return { todos: [], timestamp: null };
        }

        // Turn-boundary purge: if the last snapshot predates the most recent
        // UserPromptSubmit turn marker, treat it as empty — the user has moved
        // on to a new conversation turn and the old todos are stale.
        if (lastTurnMs > 0 && lastSnapshot.timestamp !== null) {
            const snapshotMs = new Date(lastSnapshot.timestamp).getTime();
            if (!Number.isNaN(snapshotMs) && snapshotMs < lastTurnMs) {
                return { todos: [], timestamp: lastSnapshot.timestamp };
            }
        }

        return lastSnapshot;
    } catch {
        return { todos: [], timestamp: null };
    }
}