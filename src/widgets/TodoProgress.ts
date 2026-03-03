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
    truncateText
} from './activity-utils';

export class TodoProgressWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows in-progress Claude todo item and completion progress'; }
    getDisplayName(): string { return 'Todo Progress'; }
    getCategory(): string { return 'Activity'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const widthModifier = getMaxWidthModifier(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: widthModifier ? `(${widthModifier})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const todos = context.activity?.todos ?? [];
        if (context.isPreview) {
            const preview = '▸ Fix auth bug (2/5)';
            const output = item.rawValue ? preview : `Todo: ${preview}`;
            return applyMaxWidth(output, item);
        }

        if (todos.length === 0) {
            return null;
        }

        const inProgress = todos.find(todo => todo.status === 'in_progress');
        const completedCount = todos.filter(todo => todo.status === 'completed').length;
        const totalCount = todos.length;

        let rendered: string | null = null;

        if (inProgress) {
            rendered = `▸ ${truncateText(inProgress.content, 50)} (${completedCount}/${totalCount})`;
        } else if (completedCount === totalCount && totalCount > 0) {
            rendered = `✓ All complete (${completedCount}/${totalCount})`;
        }

        if (!rendered) {
            return null;
        }

        const output = item.rawValue ? rendered : `Todo: ${rendered}`;
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
