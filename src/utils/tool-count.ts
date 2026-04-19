import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
    ToolActivityEntry,
    ToolCategory,
    ToolCountMetrics,
    ToolInvocation
} from '../types/ToolCountMetrics';

const EMPTY: ToolCountMetrics = {
    totalInvocations: 0,
    byCategory: { builtin: 0, mcp: 0 },
    byTool: {},
    lastTool: null,
    activity: []
};

const ACTIVITY_CAP = 20;
const TARGET_MAX_LEN = 60;

function getToolCountDir(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'tool-count');
}

export function getToolCountFilePath(sessionId: string): string {
    return path.join(getToolCountDir(), `tool-count-${sessionId}.jsonl`);
}

export function classifyTool(toolName: string): ToolCategory {
    if (toolName.startsWith('mcp__')) {
        return 'mcp';
    }
    return 'builtin';
}

function trimTarget(value: string): string | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;
    return trimmed.length > TARGET_MAX_LEN ? `${trimmed.slice(0, TARGET_MAX_LEN - 1)}…` : trimmed;
}

export function extractTarget(toolName: string, toolInput: unknown): string | undefined {
    if (typeof toolInput !== 'object' || toolInput === null)
        return undefined;
    const input = toolInput as Record<string, unknown>;

    if (toolName === 'Edit' || toolName === 'Write' || toolName === 'Read'
        || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
        if (typeof input.file_path === 'string')
            return trimTarget(input.file_path);
    }
    if (toolName === 'Grep' || toolName === 'Glob') {
        if (typeof input.path === 'string')
            return trimTarget(input.path);
        if (typeof input.pattern === 'string')
            return trimTarget(input.pattern);
    }
    if (toolName === 'WebFetch' || toolName === 'WebSearch') {
        if (typeof input.url === 'string')
            return trimTarget(input.url);
    }
    return undefined;
}

export function basename(target: string): string {
    if (target.includes('://')) {
        try {
            return new URL(target).host || target;
        } catch {
            // fall through
        }
    }
    const normalized = target.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const last = parts[parts.length - 1];
    return last !== undefined && last.length > 0 ? last : target;
}

function parseInvocation(line: string, sessionId: string): ToolInvocation | null {
    try {
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        const record = parsed as Record<string, unknown>;
        if (typeof record.tool_name !== 'string')
            return null;
        if (typeof record.session_id !== 'string' || record.session_id !== sessionId)
            return null;
        const category: ToolCategory = record.category === 'mcp'
            ? 'mcp'
            : classifyTool(record.tool_name);
        const inv: ToolInvocation = {
            timestamp: typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
            session_id: record.session_id,
            tool_name: record.tool_name,
            category
        };
        if (record.event === 'start' || record.event === 'end') {
            inv.event = record.event;
        }
        if (typeof record.tool_use_id === 'string' && record.tool_use_id.length > 0) {
            inv.tool_use_id = record.tool_use_id;
        }
        if (typeof record.target === 'string' && record.target.length > 0) {
            inv.target = record.target;
        }
        return inv;
    } catch {
        return null;
    }
}

export function getToolCountMetrics(sessionId: string): ToolCountMetrics {
    const filePath = getToolCountFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return { ...EMPTY, byCategory: { builtin: 0, mcp: 0 }, byTool: {}, activity: [] };
    }

    try {
        const lines = fs.readFileSync(filePath, 'utf-8')
            .split('\n')
            .filter(line => line.trim().length > 0);

        const byCategory: Record<ToolCategory, number> = { builtin: 0, mcp: 0 };
        const byTool: Record<string, number> = {};
        const activityMap = new Map<string, ToolActivityEntry>();
        let lastTool: string | null = null;
        let totalInvocations = 0;

        for (const line of lines) {
            const inv = parseInvocation(line, sessionId);
            if (!inv)
                continue;

            if (inv.event !== 'end') {
                byCategory[inv.category] += 1;
                byTool[inv.tool_name] = (byTool[inv.tool_name] ?? 0) + 1;
                lastTool = inv.tool_name;
                totalInvocations += 1;
            }

            if (!inv.tool_use_id)
                continue;

            if (inv.event === 'end') {
                const existing = activityMap.get(inv.tool_use_id);
                if (existing) {
                    existing.status = 'completed';
                    existing.endTime = new Date(inv.timestamp);
                }
            } else if (!activityMap.has(inv.tool_use_id)) {
                activityMap.set(inv.tool_use_id, {
                    id: inv.tool_use_id,
                    tool_name: inv.tool_name,
                    category: inv.category,
                    status: 'running',
                    target: inv.target,
                    startTime: new Date(inv.timestamp)
                });
            }
        }

        const activity = Array.from(activityMap.values())
            .sort((a, b) => {
                const delta = a.startTime.getTime() - b.startTime.getTime();
                if (delta !== 0)
                    return delta;
                return a.id.localeCompare(b.id);
            })
            .slice(-ACTIVITY_CAP);

        return {
            totalInvocations,
            byCategory,
            byTool,
            lastTool,
            activity
        };
    } catch {
        return { ...EMPTY, byCategory: { builtin: 0, mcp: 0 }, byTool: {}, activity: [] };
    }
}