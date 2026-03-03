import React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

import { ActivityWidthEditor } from './ActivityWidthEditor';
import {
    applyMaxWidth,
    getMaxWidthModifier,
    getToolCountSummary,
    truncatePath
} from './activity-utils';

export class ToolsActivityWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows running and recently completed Claude tool activity'; }
    getDisplayName(): string { return 'Tools Activity'; }
    getCategory(): string { return 'Activity'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const widthModifier = getMaxWidthModifier(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: widthModifier ? `(${widthModifier})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const tools = context.activity?.tools ?? [];
        if (context.isPreview) {
            const preview = '◐ Edit: auth.ts | ✓ Read ×3 | ✓ Grep ×2';
            const output = item.rawValue ? preview : `Tools: ${preview}`;
            return applyMaxWidth(output, item);
        }

        if (tools.length === 0) {
            return null;
        }

        const parts: string[] = [];
        const runningTools = tools.filter(tool => tool.status === 'running').slice(-2);
        const completedTools = tools.filter(tool => tool.status === 'completed' || tool.status === 'error');

        for (const tool of runningTools) {
            const target = tool.target ? `: ${truncatePath(tool.target, 20)}` : '';
            parts.push(`◐ ${tool.name}${target}`);
        }

        for (const [name, count] of getToolCountSummary(completedTools, 3)) {
            parts.push(`✓ ${name} ×${count}`);
        }

        if (parts.length === 0) {
            return null;
        }

        const rendered = parts.join(' | ');
        const output = item.rawValue ? rendered : `Tools: ${rendered}`;
        return applyMaxWidth(output, item);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'w', label: '(w)idth', action: 'edit-width' }
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return React.createElement(ActivityWidthEditor, props);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
