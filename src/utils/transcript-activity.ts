import * as fs from 'fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    parseJsonlLine,
    readJsonlLinesSync
} from './jsonl-lines';

export interface TranscriptActivityTool {
    id: string;
    name: string;
    target?: string;
    status: 'running' | 'completed' | 'error';
}

export interface TranscriptActivityTask {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}

export interface TranscriptActivity {
    tools: TranscriptActivityTool[];
    tasks: TranscriptActivityTask[];
}

interface TranscriptLine { message?: { content?: ContentBlock[] } }

interface ContentBlock {
    type?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    is_error?: boolean;
}

interface TranscriptFileState {
    mtimeMs: number;
    size: number;
}

interface TranscriptActivityCacheFile {
    transcriptPath: string;
    transcriptState: TranscriptFileState;
    data: TranscriptActivity;
}

interface MemoryCacheEntry {
    transcriptState: TranscriptFileState;
    data: TranscriptActivity;
}

const EMPTY_ACTIVITY: TranscriptActivity = {
    tools: [],
    tasks: []
};
const TOOL_LIMIT = 20;
const memoryCache = new Map<string, MemoryCacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function isTranscriptFileState(value: unknown): value is TranscriptFileState {
    return isRecord(value)
        && typeof value.mtimeMs === 'number'
        && typeof value.size === 'number';
}

function normalizeTaskStatus(status: unknown): TranscriptActivityTask['status'] | 'deleted' | null {
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
        case 'deleted':
            return 'deleted';
        default:
            return null;
    }
}

function isDeletedStatus(status: TranscriptActivityTask['status'] | 'deleted' | null): status is 'deleted' {
    return status === 'deleted';
}

function isTaskStatus(status: TranscriptActivityTask['status'] | 'deleted' | null): status is TranscriptActivityTask['status'] {
    return status === 'pending' || status === 'in_progress' || status === 'completed';
}

function isToolStatus(status: unknown): status is TranscriptActivityTool['status'] {
    return status === 'running' || status === 'completed' || status === 'error';
}

function isContentBlock(value: unknown): value is ContentBlock {
    return isRecord(value);
}

function getContentBlocks(value: unknown): ContentBlock[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter(isContentBlock);
}

function isToolUseBlock(block: ContentBlock): block is ContentBlock & { type: 'tool_use'; id: string; name: string } {
    return block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string';
}

function isToolResultBlock(block: ContentBlock): block is ContentBlock & { type: 'tool_result'; tool_use_id: string } {
    return block.type === 'tool_result' && typeof block.tool_use_id === 'string';
}

function getInputRecord(block: ContentBlock): Record<string, unknown> | undefined {
    return isRecord(block.input) ? block.input : undefined;
}

function isTaskItem(value: unknown): value is TranscriptActivityTask {
    return isRecord(value)
        && typeof value.content === 'string'
        && isTaskStatus(normalizeTaskStatus(value.status));
}

function isToolItem(value: unknown): value is TranscriptActivityTool {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.name === 'string'
        && (value.target === undefined || typeof value.target === 'string')
        && isToolStatus(value.status);
}

function isTranscriptActivityData(value: unknown): value is TranscriptActivity {
    return isRecord(value)
        && Array.isArray(value.tools)
        && value.tools.every(isToolItem)
        && Array.isArray(value.tasks)
        && value.tasks.every(isTaskItem);
}

function isStrictTranscriptActivityCacheFile(value: unknown): value is TranscriptActivityCacheFile {
    return isRecord(value)
        && typeof value.transcriptPath === 'string'
        && isTranscriptFileState(value.transcriptState)
        && isTranscriptActivityData(value.data);
}

function getNormalizedTaskStatus(status: unknown): TranscriptActivityTask['status'] {
    const normalizedStatus = normalizeTaskStatus(status);
    return isTaskStatus(normalizedStatus) ? normalizedStatus : 'pending';
}

function isTaskCreateInput(input: unknown): input is Record<string, unknown> {
    return isRecord(input);
}

function isTaskUpdateInput(input: unknown): input is Record<string, unknown> {
    return isRecord(input);
}

function isTodoWriteInput(input: unknown): input is { todos?: unknown } {
    return isRecord(input);
}

function getTaskContent(item: Record<string, unknown>): string {
    return getStringValue(item.content) ?? '';
}

function getTaskSubject(input: Record<string, unknown>): string {
    return getStringValue(input.subject) ?? '';
}

function getTaskDescription(input: Record<string, unknown>): string {
    return getStringValue(input.description) ?? '';
}

function getTaskId(input: Record<string, unknown>, fallback: string): string {
    const rawTaskId = input.taskId;
    if (typeof rawTaskId === 'string' || typeof rawTaskId === 'number') {
        return String(rawTaskId);
    }

    return fallback;
}

function getTaskStatusFromInput(input: Record<string, unknown>): TranscriptActivityTask['status'] | 'deleted' | null {
    return normalizeTaskStatus(input.status);
}

function getCachePath(transcriptPath: string): string {
    const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'transcript-activity', `${hash}.json`);
}

function readTranscriptFileState(transcriptPath: string): TranscriptFileState | null {
    try {
        const stat = fs.statSync(transcriptPath);
        if (!stat.isFile()) {
            return null;
        }

        return {
            mtimeMs: stat.mtimeMs,
            size: stat.size
        };
    } catch {
        return null;
    }
}

function hasMatchingState(a: TranscriptFileState, b: TranscriptFileState): boolean {
    return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

function readCache(transcriptPath: string, transcriptState: TranscriptFileState): TranscriptActivity | null {
    try {
        const cachePath = getCachePath(transcriptPath);
        const raw = fs.readFileSync(cachePath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        if (!isStrictTranscriptActivityCacheFile(parsed)) {
            return null;
        }

        if (
            parsed.transcriptPath !== path.resolve(transcriptPath)
            || !hasMatchingState(parsed.transcriptState, transcriptState)
        ) {
            return null;
        }

        return parsed.data;
    } catch {
        return null;
    }
}

function writeCache(transcriptPath: string, transcriptState: TranscriptFileState, data: TranscriptActivity): void {
    try {
        const cachePath = getCachePath(transcriptPath);
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const payload: TranscriptActivityCacheFile = {
            transcriptPath: path.resolve(transcriptPath),
            transcriptState,
            data
        };
        fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf-8');
    } catch {
        // Cache failures are best-effort only.
    }
}

function readMemoryCache(transcriptPath: string, transcriptState: TranscriptFileState): TranscriptActivity | null {
    const cacheKey = path.resolve(transcriptPath);
    const cached = memoryCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (!hasMatchingState(cached.transcriptState, transcriptState)) {
        memoryCache.delete(cacheKey);
        return null;
    }

    return cached.data;
}

function writeMemoryCache(transcriptPath: string, transcriptState: TranscriptFileState, data: TranscriptActivity): void {
    memoryCache.set(path.resolve(transcriptPath), {
        transcriptState,
        data
    });
}

function resolveTaskIndex(
    taskId: unknown,
    taskIdToIndex: Map<string, number>,
    tasks: TranscriptActivityTask[]
): number | null {
    if (typeof taskId === 'string' || typeof taskId === 'number') {
        const key = String(taskId);
        const mapped = taskIdToIndex.get(key);
        if (typeof mapped === 'number') {
            return mapped;
        }

        if (/^\d+$/.test(key)) {
            const numericIndex = Number.parseInt(key, 10) - 1;
            if (numericIndex >= 0 && numericIndex < tasks.length) {
                return numericIndex;
            }
        }
    }

    return null;
}

function removeTaskAtIndex(taskIdToIndex: Map<string, number>, tasks: TranscriptActivityTask[], index: number): void {
    tasks.splice(index, 1);

    for (const [taskId, currentIndex] of Array.from(taskIdToIndex.entries())) {
        if (currentIndex === index) {
            taskIdToIndex.delete(taskId);
        } else if (currentIndex > index) {
            taskIdToIndex.set(taskId, currentIndex - 1);
        }
    }
}

function extractToolTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
    if (!input) {
        return undefined;
    }

    switch (toolName) {
        case 'Read':
        case 'Write':
        case 'Edit':
            return getStringValue(input.file_path) ?? getStringValue(input.path);
        case 'Glob':
            return getStringValue(input.pattern);
        case 'Grep':
            return getStringValue(input.pattern);
        case 'Bash': {
            const command = getStringValue(input.command);
            if (!command) {
                return undefined;
            }
            return command.slice(0, 30) + (command.length > 30 ? '...' : '');
        }
        default:
            return undefined;
    }
}

function normalizeTodoWriteTasks(value: unknown): TranscriptActivityTask[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const tasks: TranscriptActivityTask[] = [];
    for (const item of value) {
        if (!isRecord(item)) {
            continue;
        }

        const content = getTaskContent(item);
        if (!content) {
            continue;
        }

        tasks.push({
            content,
            status: getNormalizedTaskStatus(item.status)
        });
    }

    return tasks;
}

function processEntry(
    entry: TranscriptLine,
    toolMap: Map<string, TranscriptActivityTool>,
    tasks: TranscriptActivityTask[],
    taskIdToIndex: Map<string, number>
): void {
    const content = getContentBlocks(entry.message?.content);
    if (content.length === 0) {
        return;
    }

    for (const block of content) {
        if (isToolUseBlock(block)) {
            if (block.name === 'TodoWrite') {
                const input = getInputRecord(block);
                const normalizedTasks = normalizeTodoWriteTasks(isTodoWriteInput(input) ? input.todos : undefined);
                const contentToTaskIds = new Map<string, string[]>();

                for (const [taskId, index] of taskIdToIndex) {
                    const existingTask = tasks[index];
                    if (!existingTask) {
                        continue;
                    }
                    const ids = contentToTaskIds.get(existingTask.content) ?? [];
                    ids.push(taskId);
                    contentToTaskIds.set(existingTask.content, ids);
                }

                tasks.length = 0;
                taskIdToIndex.clear();
                tasks.push(...normalizedTasks);

                for (let i = 0; i < tasks.length; i++) {
                    const task = tasks[i];
                    if (!task) {
                        continue;
                    }
                    const ids = contentToTaskIds.get(task.content);
                    if (!ids) {
                        continue;
                    }
                    for (const taskId of ids) {
                        taskIdToIndex.set(taskId, i);
                    }
                    contentToTaskIds.delete(task.content);
                }
                continue;
            }

            if (block.name === 'TaskCreate') {
                const input = getInputRecord(block);
                if (!isTaskCreateInput(input)) {
                    continue;
                }

                const subject = getTaskSubject(input);
                const description = getTaskDescription(input);
                const contentText = subject || description || 'Untitled task';
                const normalizedStatus = getTaskStatusFromInput(input);
                if (!isDeletedStatus(normalizedStatus)) {
                    tasks.push({
                        content: contentText,
                        status: isTaskStatus(normalizedStatus) ? normalizedStatus : 'pending'
                    });

                    const taskId = getTaskId(input, block.id);
                    if (taskId) {
                        taskIdToIndex.set(taskId, tasks.length - 1);
                    }
                }
                continue;
            }

            if (block.name === 'TaskUpdate') {
                const input = getInputRecord(block);
                if (!isTaskUpdateInput(input)) {
                    continue;
                }

                const index = resolveTaskIndex(input.taskId, taskIdToIndex, tasks);
                if (index !== null) {
                    const task = tasks[index];
                    if (!task) {
                        continue;
                    }

                    const normalizedStatus = getTaskStatusFromInput(input);
                    if (isDeletedStatus(normalizedStatus)) {
                        removeTaskAtIndex(taskIdToIndex, tasks, index);
                        continue;
                    }

                    if (isTaskStatus(normalizedStatus)) {
                        task.status = normalizedStatus;
                    }

                    const subject = getTaskSubject(input);
                    const description = getTaskDescription(input);
                    const contentText = subject || description;
                    if (contentText) {
                        task.content = contentText;
                    }
                }
                continue;
            }

            if (block.name === 'Task' || block.name === 'Agent') {
                continue;
            }

            toolMap.set(block.id, {
                id: block.id,
                name: block.name,
                target: extractToolTarget(block.name, getInputRecord(block)),
                status: 'running'
            });
            continue;
        }

        if (isToolResultBlock(block)) {
            const tool = toolMap.get(block.tool_use_id);
            if (tool) {
                tool.status = block.is_error ? 'error' : 'completed';
            }
        }
    }
}

function parseTranscriptActivity(transcriptPath: string): TranscriptActivity {
    const toolMap = new Map<string, TranscriptActivityTool>();
    const tasks: TranscriptActivityTask[] = [];
    const taskIdToIndex = new Map<string, number>();

    const lines = readJsonlLinesSync(transcriptPath);
    for (const line of lines) {
        const entry = parseJsonlLine(line) as TranscriptLine | null;
        if (!entry) {
            continue;
        }
        processEntry(entry, toolMap, tasks, taskIdToIndex);
    }

    return {
        tools: Array.from(toolMap.values()).slice(-TOOL_LIMIT),
        tasks
    };
}

export function getTranscriptActivity(transcriptPath: string | undefined): TranscriptActivity {
    if (!transcriptPath) {
        return EMPTY_ACTIVITY;
    }

    const transcriptState = readTranscriptFileState(transcriptPath);
    if (!transcriptState) {
        return EMPTY_ACTIVITY;
    }

    const memoryCached = readMemoryCache(transcriptPath, transcriptState);
    if (memoryCached) {
        return memoryCached;
    }

    const fileCached = readCache(transcriptPath, transcriptState);
    if (fileCached) {
        writeMemoryCache(transcriptPath, transcriptState, fileCached);
        return fileCached;
    }

    try {
        const parsed = parseTranscriptActivity(transcriptPath);
        writeMemoryCache(transcriptPath, transcriptState, parsed);
        writeCache(transcriptPath, transcriptState, parsed);
        return parsed;
    } catch {
        return EMPTY_ACTIVITY;
    }
}