import { z } from 'zod';

import type { RenderContext } from './RenderContext';
import type { Settings } from './Settings';

// Widget item schema - accepts any string type for forward compatibility
export const WidgetItemSchema = z.object({
    id: z.string(),
    type: z.string(),
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    bold: z.boolean().optional(),
    character: z.string().optional(),
    rawValue: z.boolean().optional(),
    customText: z.string().optional(),
    customSymbol: z.string().optional(),
    commandPath: z.string().optional(),
    maxWidth: z.number().optional(),
    preserveColors: z.boolean().optional(),
    timeout: z.number().optional(),
    merge: z.union([z.boolean(), z.literal('no-padding')]).optional(),
    hide: z.boolean().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    rules: z.array(z.object({
        when: z.record(z.string(), z.any()),  // flexible for now (includes optional 'not' flag)
        apply: z.record(z.string(), z.any()), // any widget properties
        stop: z.boolean().optional()
    })).optional()
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
    getDescription(): string;
    getDisplayName(): string;
    getCategory(): string;
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay;
    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null;
    getCustomKeybinds?(item?: WidgetItem): CustomKeybind[];
    renderEditor?(props: WidgetEditorProps): React.ReactElement | null;
    supportsRawValue(): boolean;
    supportsColors(item: WidgetItem): boolean;
    handleEditorAction?(action: string, item: WidgetItem): WidgetItem | null;
    /**
     * Declares the value type this widget provides for rule evaluation.
     * If not implemented, the widget has no evaluable value and will fall back to string extraction from rendered output.
     *
     * IMPORTANT: The return type of getValue() must align with what getValueType() declares:
     * - If getValueType() returns 'number', getValue() must return number | null
     * - If getValueType() returns 'string', getValue() must return string | null
     * - If getValueType() returns 'boolean', getValue() must return boolean | null
     *
     * This is a convention that must be followed by implementations, though not enforced by TypeScript
     * (since getValue()'s return type is a union of all possible value types).
     */
    getValueType?(): 'string' | 'number' | 'boolean';
    /**
     * Extracts the typed value from this widget for rule evaluation.
     * Returns null if the widget cannot provide a value in the current context.
     *
     * The returned type MUST match what getValueType() declares (see getValueType documentation).
     */
    getValue?(context: RenderContext, item: WidgetItem): number | string | boolean | null;
}

export interface WidgetEditorProps {
    widget: WidgetItem;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
    action?: string;
}

export interface CustomKeybind {
    key: string;
    label: string;
    action: string;
}