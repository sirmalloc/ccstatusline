import type { RenderContext } from './RenderContext';
import type { Settings } from './Settings';

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

export interface WidgetEditorDisplay {
    displayText: string;
    modifierText?: string;
}

export interface Widget {
    getDefaultColor(): string;
    getDisplayName(): string;
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay;
    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null;
    getCustomKeybinds?(): CustomKeybind[];
    renderEditor?(props: WidgetEditorProps): React.ReactElement | null;
    supportsRawValue(): boolean;
    setEditorAction?(action: string): void;
}

export interface WidgetEditorProps {
    widget: WidgetItem;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

export interface CustomKeybind {
    key: string;
    label: string;
    action: string;
}