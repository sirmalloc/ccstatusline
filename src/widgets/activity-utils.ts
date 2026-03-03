import type {
    ActivityAgentEntry,
    ActivityToolEntry
} from '../types/Activity';
import type { WidgetItem } from '../types/Widget';
import {
    getVisibleWidth,
    truncateStyledText
} from '../utils/ansi';

export function getMaxWidthModifier(item: WidgetItem): string | undefined {
    if (item.maxWidth && item.maxWidth > 0) {
        return `max:${item.maxWidth}`;
    }
    return undefined;
}

export function applyMaxWidth(text: string, item: WidgetItem): string {
    if (!item.maxWidth || item.maxWidth <= 0) {
        return text;
    }

    if (getVisibleWidth(text) <= item.maxWidth) {
        return text;
    }

    return truncateStyledText(text, item.maxWidth, { ellipsis: true });
}

export function truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return value.slice(0, maxLength - 3) + '...';
}

export function truncatePath(value: string, maxLength = 24): string {
    const normalized = value.replace(/\\/g, '/');
    if (normalized.length <= maxLength) {
        return normalized;
    }

    const segments = normalized.split('/');
    const fileName = segments.pop() ?? normalized;

    if (fileName.length >= maxLength) {
        return truncateText(fileName, maxLength);
    }

    return `.../${fileName}`;
}

export function formatElapsed(startTime: Date, endTime?: Date): string {
    const now = endTime ?? new Date();
    const elapsedMs = now.getTime() - startTime.getTime();

    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        return '<1s';
    }
    if (elapsedMs < 1000) {
        return '<1s';
    }
    if (elapsedMs < 60000) {
        return `${Math.round(elapsedMs / 1000)}s`;
    }

    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.round((elapsedMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

export function getToolCountSummary(tools: ActivityToolEntry[], limit = 3): [string, number][] {
    const counts = new Map<string, number>();

    for (const tool of tools) {
        const count = counts.get(tool.name) ?? 0;
        counts.set(tool.name, count + 1);
    }

    return Array.from(counts.entries())
        .sort((a, b) => {
            if (a[1] !== b[1]) {
                return b[1] - a[1];
            }
            return a[0].localeCompare(b[0]);
        })
        .slice(0, limit);
}

export function formatAgentLabel(agent: ActivityAgentEntry, maxDescriptionLength = 36): string {
    const model = agent.model ? ` [${agent.model}]` : '';
    const description = agent.description
        ? `: ${truncateText(agent.description, maxDescriptionLength)}`
        : '';
    return `${agent.type}${model}${description}`;
}
