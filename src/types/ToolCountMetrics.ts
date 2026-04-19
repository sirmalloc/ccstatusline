export type ToolCategory = 'builtin' | 'mcp';

export interface ToolInvocation {
    timestamp: string;
    session_id: string;
    tool_name: string;
    category: ToolCategory;
}

export interface ToolCountMetrics {
    totalInvocations: number;
    byCategory: Record<ToolCategory, number>;
    byTool: Record<string, number>;
    lastTool: string | null;
}