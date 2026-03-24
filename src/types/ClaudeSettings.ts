export interface ClaudeSettings {
    effortLevel?: 'low' | 'medium' | 'high' | 'max';
    permissions?: {
        allow?: string[];
        deny?: string[];
        additionalDirectories?: string[];
    };
    statusLine?: {
        type: string;
        command: string;
        padding?: number;
    };
    [key: string]: unknown;
}