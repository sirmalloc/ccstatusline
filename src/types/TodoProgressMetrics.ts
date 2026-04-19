export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
    content: string;
    activeForm?: string;
    status: TodoStatus;
}

export interface TodoProgressSnapshot {
    timestamp: string;
    session_id: string;
    todos: TodoItem[];
}

export interface TodoProgressMetrics {
    todos: TodoItem[];
    timestamp: string | null;
}