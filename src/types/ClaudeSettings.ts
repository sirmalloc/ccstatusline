export interface ClaudeSettings {
    permissions?: {
        allow?: string[];
        deny?: string[];
    };
    statusLine?: {
        type: string;
        command: string;
        padding?: number;
    };
    [key: string]: unknown;
}