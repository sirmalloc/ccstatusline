import * as fs from 'fs';
import * as path from 'path';

import type {
    ActivityAgentEntry,
    ActivityParseOptions,
    ActivitySnapshot,
    ActivityTodoItem,
    ActivityTodoStatus,
    ActivityToolEntry
} from '../types/Activity';

const DEFAULT_MAX_TOOLS = 20;
const DEFAULT_MAX_AGENTS = 10;

interface TranscriptLine {
    timestamp?: string;
    message?: { content?: TranscriptContent[] };
}

interface TranscriptContent {
    type?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    is_error?: boolean;
}

interface ActivityCacheEntry {
    path: string;
    mtimeMs: number;
    size: number;
    snapshot: ActivitySnapshot;
}

let activityCacheEntry: ActivityCacheEntry | null = null;

function createEmptySnapshot(): ActivitySnapshot {
    return {
        tools: [],
        agents: [],
        todos: [],
        updatedAt: null
    };
}

function parseDate(timestamp: unknown): Date | null {
    if (typeof timestamp !== 'string') {
        return null;
    }

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return value.slice(0, maxLength - 3) + '...';
}

function extractToolTarget(name: string, input?: Record<string, unknown>): string | undefined {
    if (!input) {
        return undefined;
    }

    switch (name) {
        case 'Read':
        case 'Write':
        case 'Edit': {
            const filePath = input.file_path;
            if (typeof filePath === 'string' && filePath.length > 0) {
                return filePath;
            }

            const pathValue = input.path;
            if (typeof pathValue === 'string' && pathValue.length > 0) {
                return pathValue;
            }
            return undefined;
        }
        case 'Glob':
        case 'Grep': {
            const pattern = input.pattern;
            return typeof pattern === 'string' && pattern.length > 0 ? pattern : undefined;
        }
        case 'Bash': {
            const command = input.command;
            if (typeof command !== 'string' || command.length === 0) {
                return undefined;
            }
            return truncate(command, 30);
        }
        default:
            return undefined;
    }
}

function normalizeTodoStatus(status: unknown): ActivityTodoStatus | null {
    if (typeof status !== 'string') {
        return null;
    }

    switch (status) {
        case 'pending':
        case 'not_started':
            return 'pending';
        case 'in_progress':
        case 'running':
            return 'in_progress';
        case 'completed':
        case 'complete':
        case 'done':
            return 'completed';
        default:
            return null;
    }
}

function getTaskIdentifier(input: Record<string, unknown>, fallbackId: string): string {
    const rawTaskId = input.taskId;
    if (typeof rawTaskId === 'string' || typeof rawTaskId === 'number') {
        return String(rawTaskId);
    }
    return fallbackId;
}

function resolveTaskIndex(
    taskId: unknown,
    taskIdToIndex: Map<string, number>,
    todos: ActivityTodoItem[]
): number | null {
    if (typeof taskId === 'string' || typeof taskId === 'number') {
        const taskKey = String(taskId);
        const mappedIndex = taskIdToIndex.get(taskKey);
        if (typeof mappedIndex === 'number') {
            return mappedIndex;
        }

        if (/^\d+$/.test(taskKey)) {
            const oneBasedIndex = Number.parseInt(taskKey, 10);
            const zeroBasedIndex = oneBasedIndex - 1;
            if (zeroBasedIndex >= 0 && zeroBasedIndex < todos.length) {
                return zeroBasedIndex;
            }
        }
    }

    return null;
}

function applyTodoWrite(input: Record<string, unknown>, todos: ActivityTodoItem[], taskIdToIndex: Map<string, number>): void {
    const inputTodos = input.todos;
    if (!Array.isArray(inputTodos)) {
        return;
    }

    todos.length = 0;
    taskIdToIndex.clear();

    for (let index = 0; index < inputTodos.length; index++) {
        const todo = inputTodos[index] as unknown;
        if (!todo || typeof todo !== 'object') {
            continue;
        }

        const todoRecord = todo as Record<string, unknown>;
        const content = typeof todoRecord.content === 'string' ? todoRecord.content : '';
        const normalizedStatus = normalizeTodoStatus(todoRecord.status) ?? 'pending';

        todos.push({
            content: content || 'Untitled task',
            status: normalizedStatus
        });

        const taskId = typeof todoRecord.id === 'string' || typeof todoRecord.id === 'number'
            ? String(todoRecord.id)
            : String(index + 1);
        taskIdToIndex.set(taskId, todos.length - 1);
    }
}

function applyTaskCreate(
    blockId: string,
    input: Record<string, unknown>,
    todos: ActivityTodoItem[],
    taskIdToIndex: Map<string, number>
): void {
    const subject = typeof input.subject === 'string' ? input.subject : '';
    const description = typeof input.description === 'string' ? input.description : '';
    const content = subject || description || 'Untitled task';
    const status = normalizeTodoStatus(input.status) ?? 'pending';

    todos.push({
        content,
        status
    });

    taskIdToIndex.set(getTaskIdentifier(input, blockId), todos.length - 1);
}

function applyTaskUpdate(
    input: Record<string, unknown>,
    todos: ActivityTodoItem[],
    taskIdToIndex: Map<string, number>
): void {
    const index = resolveTaskIndex(input.taskId, taskIdToIndex, todos);
    if (index === null) {
        return;
    }

    const todo = todos[index];
    if (!todo) {
        return;
    }

    const status = normalizeTodoStatus(input.status);
    if (status) {
        todo.status = status;
    }

    const subject = typeof input.subject === 'string' ? input.subject : '';
    const description = typeof input.description === 'string' ? input.description : '';
    const content = subject || description;
    if (content) {
        todo.content = content;
    }
}

export function parseActivityContent(content: string, options: ActivityParseOptions = {}): ActivitySnapshot {
    const snapshot = createEmptySnapshot();
    const toolsById = new Map<string, ActivityToolEntry>();
    const agentsById = new Map<string, ActivityAgentEntry>();
    const todos: ActivityTodoItem[] = [];
    const taskIdToIndex = new Map<string, number>();
    const maxTools = options.maxTools ?? DEFAULT_MAX_TOOLS;
    const maxAgents = options.maxAgents ?? DEFAULT_MAX_AGENTS;

    const lines = content.split('\n');
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        let entry: TranscriptLine;
        try {
            entry = JSON.parse(line) as TranscriptLine;
        } catch {
            continue;
        }

        const entryTimestamp = parseDate(entry.timestamp);
        if (entryTimestamp) {
            const previousTimestamp = snapshot.updatedAt;
            if (!previousTimestamp || entryTimestamp.getTime() > previousTimestamp.getTime()) {
                snapshot.updatedAt = entryTimestamp;
            }
        }

        const blocks = entry.message?.content;
        if (!Array.isArray(blocks)) {
            continue;
        }

        const timestamp = entryTimestamp ?? new Date();

        for (const rawBlock of blocks as unknown[]) {
            if (!rawBlock || typeof rawBlock !== 'object') {
                continue;
            }
            const block = rawBlock as TranscriptContent;

            if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
                if (block.name === 'Task') {
                    const input = block.input ?? {};
                    const agentEntry: ActivityAgentEntry = {
                        id: block.id,
                        type: typeof input.subagent_type === 'string' ? input.subagent_type : 'unknown',
                        model: typeof input.model === 'string' ? input.model : undefined,
                        description: typeof input.description === 'string' ? input.description : undefined,
                        status: 'running',
                        startTime: timestamp
                    };
                    agentsById.set(block.id, agentEntry);
                    continue;
                }

                if (block.name === 'TodoWrite') {
                    applyTodoWrite(block.input ?? {}, todos, taskIdToIndex);
                    continue;
                }

                if (block.name === 'TaskCreate') {
                    applyTaskCreate(block.id, block.input ?? {}, todos, taskIdToIndex);
                    continue;
                }

                if (block.name === 'TaskUpdate') {
                    applyTaskUpdate(block.input ?? {}, todos, taskIdToIndex);
                    continue;
                }

                toolsById.set(block.id, {
                    id: block.id,
                    name: block.name,
                    target: extractToolTarget(block.name, block.input),
                    status: 'running',
                    startTime: timestamp
                });
                continue;
            }

            if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
                const tool = toolsById.get(block.tool_use_id);
                if (tool) {
                    tool.status = block.is_error ? 'error' : 'completed';
                    tool.endTime = timestamp;
                }

                const agent = agentsById.get(block.tool_use_id);
                if (agent) {
                    agent.status = 'completed';
                    agent.endTime = timestamp;
                }
            }
        }
    }

    snapshot.tools = Array.from(toolsById.values()).slice(-maxTools);
    snapshot.agents = Array.from(agentsById.values()).slice(-maxAgents);
    snapshot.todos = todos;
    return snapshot;
}

export function getActivitySnapshot(transcriptPath?: string, options: ActivityParseOptions = {}): ActivitySnapshot {
    if (!transcriptPath || transcriptPath.trim() === '') {
        return createEmptySnapshot();
    }

    const resolvedPath = path.resolve(transcriptPath);

    let stats: fs.Stats;
    try {
        stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
            return createEmptySnapshot();
        }
    } catch {
        return createEmptySnapshot();
    }

    const cached = activityCacheEntry;
    if (
        cached?.path === resolvedPath
        && cached.mtimeMs === stats.mtimeMs
        && cached.size === stats.size
    ) {
        return cached.snapshot;
    }

    let content: string;
    try {
        content = fs.readFileSync(resolvedPath, 'utf-8');
    } catch {
        return createEmptySnapshot();
    }

    const snapshot = parseActivityContent(content, options);
    activityCacheEntry = {
        path: resolvedPath,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        snapshot
    };
    return snapshot;
}

export function clearActivitySnapshotCache(): void {
    activityCacheEntry = null;
}