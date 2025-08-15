export type WidgetItemType = 'model' | 'git-branch' | 'git-changes' | 'separator' | 'flex-separator'
    | 'tokens-input' | 'tokens-output' | 'tokens-cached' | 'tokens-total' | 'context-length' | 'context-percentage' | 'context-percentage-usable' | 'terminal-width' | 'session-clock' | 'version' | 'custom-text' | 'custom-command';

export interface WidgetItem {
    id: string;
    type: WidgetItemType;
    color?: string;
    backgroundColor?: string; // Background color for the widget
    bold?: boolean; // Bold text styling
    character?: string; // For separator and flex-separator types
    rawValue?: boolean; // Show value without label prefix
    customText?: string; // For custom-text type
    commandPath?: string; // For custom-command type - the command to execute
    maxWidth?: number; // For custom-command type - max width of output
    preserveColors?: boolean; // For custom-command type - preserve ANSI colors from command output
    timeout?: number; // For custom-command type - timeout in milliseconds (default: 1000)
    merge?: boolean | 'no-padding'; // Merge with next widget: true = merge with padding, 'no-padding' = merge without padding
}