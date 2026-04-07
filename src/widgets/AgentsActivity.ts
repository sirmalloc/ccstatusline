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
    formatAgentLabel,
    formatElapsed,
    getMaxWidthModifier
} from './activity-utils';

export class AgentsActivityWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows running and recently completed Claude subagent activity'; }
    getDisplayName(): string { return 'Agents Activity'; }
    getCategory(): string { return 'Activity'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const widthModifier = getMaxWidthModifier(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: widthModifier ? `(${widthModifier})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const agents = context.activity?.agents ?? [];
        if (context.isPreview) {
            const preview = '◐ explore [haiku]: tracing auth flow (42s) | ✓ reviewer (1m 8s)';
            const output = item.rawValue ? preview : `Agents: ${preview}`;
            return applyMaxWidth(output, item);
        }

        if (agents.length === 0) {
            return null;
        }

        const runningAgents = agents.filter(agent => agent.status === 'running');
        const recentCompletedAgents = agents.filter(agent => agent.status === 'completed').slice(-2);
        const selectedAgents = [...runningAgents, ...recentCompletedAgents].slice(-3);

        if (selectedAgents.length === 0) {
            return null;
        }

        const parts = selectedAgents.map((agent) => {
            const icon = agent.status === 'running' ? '◐' : '✓';
            const label = formatAgentLabel(agent, 28);
            const elapsed = formatElapsed(agent.startTime, agent.endTime);
            return `${icon} ${label} (${elapsed})`;
        });

        const rendered = parts.join(' | ');
        const output = item.rawValue ? rendered : `Agents: ${rendered}`;
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