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
import { getDetailLevel } from '../utils/detail-level';

import { ActivityWidthEditor } from './ActivityWidthEditor';
import {
    applyMaxWidth,
    getMaxWidthModifier
} from './activity-utils';

function formatEnvironmentParts(counts: { claudeMdCount: number; rulesCount: number; mcpCount: number; hooksCount: number }): string | null {
    const parts: string[] = [];

    if (counts.claudeMdCount > 0) {
        parts.push(`${counts.claudeMdCount} CLAUDE.md`);
    }
    if (counts.mcpCount > 0) {
        parts.push(`${counts.mcpCount} MCP`);
    }
    if (counts.rulesCount > 0) {
        parts.push(`${counts.rulesCount} rules`);
    }
    if (counts.hooksCount > 0) {
        parts.push(`${counts.hooksCount} hook${counts.hooksCount === 1 ? '' : 's'}`);
    }

    if (parts.length === 0) {
        return null;
    }

    return parts.join(' | ');
}

function formatEnvironmentCompact(counts: { claudeMdCount: number; rulesCount: number; mcpCount: number; hooksCount: number }): string | null {
    const parts: string[] = [];

    if (counts.claudeMdCount > 0) {
        parts.push(`${counts.claudeMdCount}md`);
    }
    if (counts.mcpCount > 0) {
        parts.push(`${counts.mcpCount}mcp`);
    }
    if (counts.rulesCount > 0) {
        parts.push(`${counts.rulesCount}r`);
    }
    if (counts.hooksCount > 0) {
        parts.push(`${counts.hooksCount}h`);
    }

    if (parts.length === 0) {
        return null;
    }

    return parts.join(' ');
}

export class EnvironmentWidget implements Widget {
    getDefaultColor(): string { return 'brightBlack'; }
    getDescription(): string { return 'Shows counts of CLAUDE.md files, MCP servers, rules, and hooks'; }
    getDisplayName(): string { return 'Environment'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const widthModifier = getMaxWidthModifier(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: widthModifier ? `(${widthModifier})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            const preview = '3 CLAUDE.md | 2 MCP | 5 rules | 1 hook';
            const output = item.rawValue ? preview : `Env: ${preview}`;
            return applyMaxWidth(output, item);
        }

        const envData = context.environmentData;
        if (!envData) {
            return null;
        }

        const detail = getDetailLevel(context.terminalWidth);
        const rendered = detail === 'wide'
            ? formatEnvironmentParts(envData)
            : formatEnvironmentCompact(envData);

        if (!rendered) {
            return null;
        }

        const output = detail === 'wide'
            ? (item.rawValue ? rendered : `Env: ${rendered}`)
            : rendered;
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