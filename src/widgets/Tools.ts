import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getTranscriptActivity } from '../utils/transcript-activity';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const RUNNING_LIMIT = 2;
const SUMMARY_LIMIT = 4;
const TARGET_LIMIT = 20;

function truncateTarget(target: string): string {
    const normalized = target.replace(/\\/g, '/');
    if (normalized.length <= TARGET_LIMIT) {
        return normalized;
    }

    const parts = normalized.split('/');
    const leaf = parts.pop() ?? normalized;
    if (leaf.length >= TARGET_LIMIT) {
        return `${leaf.slice(0, TARGET_LIMIT - 3)}...`;
    }

    return `.../${leaf}`;
}

export class ToolsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows Claude tool activity from the main session transcript'; }
    getDisplayName(): string { return 'Tools'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: '(running + summary)'
        };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Tools: ', '◐ Edit: .../auth.ts | ✓ Read ×3');
        }

        const activity = getTranscriptActivity(context.data?.transcript_path);
        if (activity.tools.length === 0) {
            return null;
        }

        const parts: string[] = [];
        const runningTools = activity.tools.filter(tool => tool.status === 'running').slice(-RUNNING_LIMIT);
        const completedTools = activity.tools.filter(tool => tool.status === 'completed' || tool.status === 'error');

        for (const tool of runningTools) {
            const target = tool.target ? `: ${truncateTarget(tool.target)}` : '';
            parts.push(`◐ ${tool.name}${target}`);
        }

        const counts = new Map<string, number>();
        for (const tool of completedTools) {
            counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
        }

        const sortedCounts = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, SUMMARY_LIMIT);

        for (const [name, count] of sortedCounts) {
            parts.push(`✓ ${name} ×${count}`);
        }

        if (parts.length === 0) {
            return null;
        }

        return formatRawOrLabeledValue(item, 'Tools: ', parts.join(' | '));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}