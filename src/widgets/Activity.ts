import React from 'react';

import type {
    ActivityAgentEntry,
    ActivityTodoItem,
    ActivityToolEntry
} from '../types/Activity';
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
    getMaxWidthModifier,
    getToolCountSummary,
    truncatePath,
    truncateText
} from './activity-utils';

function formatRunningTool(tool: ActivityToolEntry): string {
    const target = tool.target ? `: ${truncatePath(tool.target, 20)}` : '';
    return `◐ ${tool.name}${target}`;
}

function formatRunningAgent(agent: ActivityAgentEntry): string {
    return `◐ ${formatAgentLabel(agent, 24)} (${formatElapsed(agent.startTime, agent.endTime)})`;
}

function formatTodoSegment(todos: ActivityTodoItem[]): string | null {
    if (todos.length === 0) {
        return null;
    }

    const inProgress = todos.find(todo => todo.status === 'in_progress');
    const completedCount = todos.filter(todo => todo.status === 'completed').length;

    if (inProgress) {
        return `▸ ${truncateText(inProgress.content, 36)} (${completedCount}/${todos.length})`;
    }
    if (completedCount === todos.length) {
        return `✓ todos (${completedCount}/${todos.length})`;
    }

    return `${completedCount}/${todos.length} todos`;
}

export class ActivityWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows compact running-first Claude activity across tools, agents, and todos'; }
    getDisplayName(): string { return 'All Activity'; }
    getCategory(): string { return 'Activity'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const widthModifier = getMaxWidthModifier(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: widthModifier ? `(${widthModifier})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const activity = context.activity;
        if (context.isPreview) {
            const preview = '◐ Edit: auth.ts | ◐ explore [haiku] (42s) | ▸ Fix auth bug (2/5) | ✓T12 ✓A3 TD2/5';
            const output = item.rawValue ? preview : `All Activity: ${preview}`;
            return applyMaxWidth(output, item);
        }

        if (!activity) {
            return null;
        }

        const tools = activity.tools;
        const agents = activity.agents;
        const todos = activity.todos;

        const segments: string[] = [];

        const runningTool = tools.filter(tool => tool.status === 'running').slice(-1)[0];
        if (runningTool) {
            segments.push(formatRunningTool(runningTool));
        }

        const runningAgent = agents.filter(agent => agent.status === 'running').slice(-1)[0];
        if (runningAgent) {
            segments.push(formatRunningAgent(runningAgent));
        }

        const todoSegment = formatTodoSegment(todos);
        if (todoSegment) {
            segments.push(todoSegment);
        }

        if (segments.length === 0) {
            const completedToolSummary = getToolCountSummary(
                tools.filter(tool => tool.status === 'completed' || tool.status === 'error'),
                2
            );
            for (const [name, count] of completedToolSummary) {
                segments.push(`✓ ${name} ×${count}`);
            }

            const latestCompletedAgent = agents.filter(agent => agent.status === 'completed').slice(-1)[0];
            if (latestCompletedAgent) {
                segments.push(`✓ ${latestCompletedAgent.type} (${formatElapsed(latestCompletedAgent.startTime, latestCompletedAgent.endTime)})`);
            }
        }

        const completedToolsCount = tools.filter(tool => tool.status === 'completed' || tool.status === 'error').length;
        const completedAgentsCount = agents.filter(agent => agent.status === 'completed').length;
        const completedTodosCount = todos.filter(todo => todo.status === 'completed').length;

        const counters: string[] = [];
        if (completedToolsCount > 0) {
            counters.push(`✓T${completedToolsCount}`);
        }
        if (completedAgentsCount > 0) {
            counters.push(`✓A${completedAgentsCount}`);
        }
        if (todos.length > 0) {
            counters.push(`TD${completedTodosCount}/${todos.length}`);
        }
        if (counters.length > 0) {
            segments.push(counters.join(' '));
        }

        if (segments.length === 0) {
            return null;
        }

        const rendered = segments.join(' | ');
        const output = item.rawValue ? rendered : `All Activity: ${rendered}`;
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
