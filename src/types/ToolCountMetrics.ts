export type ToolCategory = 'builtin' | 'mcp';

export type ToolActivityStatus = 'running' | 'completed';

export interface ToolInvocation {
    timestamp: string;
    session_id: string;
    tool_name: string;
    category: ToolCategory;
    event?: 'start' | 'end';
    tool_use_id?: string;
    target?: string;
}

export interface ToolActivityEntry {
    tool_name: string;
    category: ToolCategory;
    status: ToolActivityStatus;
    target?: string;
    startTime: Date;
    endTime?: Date;
    id: string;
}

export interface ToolCountMetrics {
    totalInvocations: number;
    byCategory: Record<ToolCategory, number>;
    byTool: Record<string, number>;
    lastTool: string | null;
    activity: ToolActivityEntry[];
}