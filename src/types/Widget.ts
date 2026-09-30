import { z } from 'zod';

import { NumberFormatSchema } from './NumberFormat';
import type { RenderContext } from './RenderContext';
import type { Settings } from './Settings';

// Widget item schema - accepts any string type for forward compatibility
export const WidgetItemSchema = z.object({
    id: z.string(),
    type: z.string(),
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    bold: z.boolean().optional(),
    dim: z.union([z.boolean(), z.literal('parens')]).optional(),
    numberFormat: NumberFormatSchema.optional(),
    character: z.string().optional(),
    rawValue: z.boolean().optional(),
    customText: z.string().optional(),
    customSymbol: z.string().optional(),
    commandPath: z.string().optional(),
    maxWidth: z.number().optional(),
    preserveColors: z.boolean().optional(),
    timeout: z.number().optional(),
    merge: z.union([z.boolean(), z.literal('no-padding')]).optional(),
    excludeFromAutoAlign: z.boolean().optional(),
    metadata: z.record(z.string(), z.string()).optional()
});

// Inferred types from Zod schemas
export type WidgetItem = z.infer<typeof WidgetItemSchema>;
export type WidgetItemType = string; // Allow any string for forward compatibility

export interface WidgetEditorDisplay {
    displayText: string;
    modifierText?: string;
}

// A condition under which a widget can hide instead of rendering placeholder
// output (e.g. 'no-git', 'zero'). Stored in metadata.hide as a comma-separated
// list of enabled state keys; defaultEnabled states apply when metadata.hide is absent.
export interface HideableState {
    key: string;
    label: string;
    defaultEnabled?: boolean;
}

export interface Widget {
    getDefaultColor(): string;
    getDescription(): string;
    getDisplayName(): string;
    getCategory(): string;
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay;
    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null;
    getCustomKeybinds?(item?: WidgetItem): CustomKeybind[];
    getHideableStates?(): HideableState[];
    // Names the TUI editor to open for props.action (null: none). Widgets
    // return a plain descriptor rather than a React element so the status line
    // render path never loads ink/React; the TUI maps it to a component in
    // tui/components/widget-editors.
    renderEditor?(props: WidgetEditorProps): WidgetEditorDescriptor | null;
    supportsRawValue(): boolean;
    supportsColors(item: WidgetItem): boolean;
    // Whether the widget renders a number whose precision can be overridden.
    // Gates the items editor's precision keybind; widgets that omit it are
    // treated as non-numeric.
    supportsNumberFormat?(): boolean;
    handleEditorAction?(action: string, item: WidgetItem): WidgetItem | null;
    getNumericValue?(context: RenderContext, item: WidgetItem): number | null;
    /**
     * When true for the given item, the widget's rendered output already
     * contains its own ANSI foreground codes and the renderer must not apply
     * theme/item foreground colors on top of it. Global foreground overrides
     * still take precedence (see custom-command's preserve-colors mode).
     */
    preservesRenderedColors?(item: WidgetItem): boolean;
}

export interface WidgetEditorProps {
    widget: WidgetItem;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
    action?: string;
}

// One editable symbol of a widget. id 'character' stores on the item's
// character field (the pre-existing override convention); any other id is a
// metadata key, which is how widgets with several symbols keep them apart.
export interface SymbolSlot {
    id: string;
    label: string;
    defaultSymbol: string;
}

// TUI editors that take only the standard editor props
export type BasicWidgetEditorKind
    = | 'current-working-dir'
        | 'custom-command'
        | 'custom-symbol'
        | 'custom-text'
        | 'link'
        | 'max-width'
        | 'skills'
        | 'speed-window'
        | 'usage-locale'
        | 'usage-timezone';

export type WidgetEditorDescriptor
    = | { kind: BasicWidgetEditorKind; props: WidgetEditorProps }
        | { kind: 'symbol-slots'; props: WidgetEditorProps; slots: SymbolSlot[] };

export interface CustomKeybind {
    key: string;
    label: string;
    action: string;
}
