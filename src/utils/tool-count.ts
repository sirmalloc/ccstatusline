import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
    ToolCategory,
    ToolCountMetrics,
    ToolInvocation
} from '../types/ToolCountMetrics';

const EMPTY: ToolCountMetrics = {
    totalInvocations: 0,
    byCategory: { builtin: 0, mcp: 0 },
    byTool: {},
    lastTool: null
};

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

export function getToolCountMetrics(sessionId: string): ToolCountMetrics {
    const filePath = getToolCountFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return EMPTY;
    }

    try {
        const invocations: ToolInvocation[] = fs.readFileSync(filePath, 'utf-8')
            .trim().split('\n')
            .filter(line => line.trim())
            .map((line) => {
                try { return JSON.parse(line) as ToolInvocation; } catch {
                    return null;
                }
            })
            .filter((e): e is ToolInvocation => e !== null
                && typeof e.tool_name === 'string'
                && typeof e.session_id === 'string'
                && e.session_id === sessionId);
        if (invocations.length === 0) {
            return EMPTY;
        }

        const byCategory: Record<ToolCategory, number> = { builtin: 0, mcp: 0 };
        const byTool: Record<string, number> = {};
        for (const inv of invocations) {
            const cat: ToolCategory = inv.category === 'mcp'
                ? 'mcp'
                : classifyTool(inv.tool_name);
            byCategory[cat] += 1;
            byTool[inv.tool_name] = (byTool[inv.tool_name] ?? 0) + 1;
        }

        return {
            totalInvocations: invocations.length,
            byCategory,
            byTool,
            lastTool: invocations[invocations.length - 1]?.tool_name ?? null
        };
    } catch {
        return EMPTY;
    }
}