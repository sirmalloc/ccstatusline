export interface ClaudeSettings {
    effortLevel?: 'low' | 'medium' | 'high' | 'max';
    permissions?: {
        allow?: string[];
        deny?: string[];
    };
    statusLine?: {
        type: string;
        command: string;
        padding?: number;
        refreshInterval?: number;
    };
    [key: string]: unknown;
}