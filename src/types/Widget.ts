import { z } from 'zod';

import type { RenderContext } from './RenderContext';
import type { Settings } from './Settings';

// Known widget types
export const KNOWN_WIDGET_TYPES = [
    'model', 'git-branch', 'git-changes', 'separator', 'flex-separator',
    'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total',
    'context-length', 'context-percentage', 'context-percentage-usable',
    'terminal-width', 'session-clock', 'version', 'custom-text', 'custom-command'
] as const;

// Widget item schema - accepts any string type for forward compatibility
export const WidgetItemSchema = z.object({
    id: z.string(),
    type: z.union([
        z.enum(KNOWN_WIDGET_TYPES),
        z.string() // Accept any string for forward compatibility
    ]),
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    bold: z.boolean().optional(),
    character: z.string().optional(),
    rawValue: z.boolean().optional(),
    customText: z.string().optional(),
    commandPath: z.string().optional(),
    maxWidth: z.number().optional(),
    preserveColors: z.boolean().optional(),
    timeout: z.number().optional(),
    merge: z.union([z.boolean(), z.literal('no-padding')]).optional()
});

// Inferred types from Zod schemas
export type WidgetItem = z.infer<typeof WidgetItemSchema>;
export type WidgetItemType = string; // Allow any string for forward compatibility

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