import { z } from 'zod';

import type { RenderContext } from './RenderContext';
import type { Settings } from './Settings';

// Rule apply schema - restricted to appearance properties only
export const RuleApplySchema = z.object({
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    bold: z.boolean().optional(),
    rawValue: z.boolean().optional(),
    customText: z.string().optional(),
    hide: z.boolean().optional()
});

// Rule schema - condition + appearance overrides
export const RuleSchema = z.object({
    when: z.record(z.string(), z.any()),
    apply: RuleApplySchema,
    stop: z.boolean().optional()
});

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
    rules: z.array(RuleSchema).optional()
});

// Inferred types from Zod schemas
export type RuleApply = z.infer<typeof RuleApplySchema>;
export type Rule = z.infer<typeof RuleSchema>;
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
    getValueType?(): 'string' | 'number' | 'boolean';
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
