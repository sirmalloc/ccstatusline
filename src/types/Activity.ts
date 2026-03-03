export type ActivityToolStatus = 'running' | 'completed' | 'error';

export type ActivityAgentStatus = 'running' | 'completed';

export type ActivityTodoStatus = 'pending' | 'in_progress' | 'completed';

export interface ActivityToolEntry {
    id: string;
    name: string;
    target?: string;
    status: ActivityToolStatus;
    startTime: Date;
    endTime?: Date;
}

export interface ActivityAgentEntry {
    id: string;
    type: string;
    model?: string;
    description?: string;
    status: ActivityAgentStatus;
    startTime: Date;
    endTime?: Date;
}

export interface ActivityTodoItem {
    content: string;
    status: ActivityTodoStatus;
}

export interface ActivitySnapshot {
    tools: ActivityToolEntry[];
    agents: ActivityAgentEntry[];
    todos: ActivityTodoItem[];
    updatedAt: Date | null;
}

export interface ActivityParseOptions {
    maxTools?: number;
    maxAgents?: number;
}
