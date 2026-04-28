import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { loadClaudeSettingsSync } from '../utils/claude-settings';
import {
    getTranscriptThinkingEffort,
    normalizeThinkingEffort,
    type ResolvedThinkingEffort,
    type TranscriptThinkingEffort
} from '../utils/jsonl';

export type ThinkingEffortLevel = TranscriptThinkingEffort;

function resolveThinkingEffortFromStatusJson(context: RenderContext): ResolvedThinkingEffort | null | undefined {
    const effort = context.data?.effort;
    if (!effort || !('level' in effort)) {
        return undefined;
    }

    return typeof effort.level === 'string' ? normalizeThinkingEffort(effort.level) : null;
}

function resolveThinkingEffortFromSettings(): ResolvedThinkingEffort | undefined {
    try {
        const settings = loadClaudeSettingsSync({ logErrors: false });
        return normalizeThinkingEffort(settings.effortLevel);
    } catch {
        // Settings unavailable, return undefined
    }

    return undefined;
}

function resolveThinkingEffort(context: RenderContext): ResolvedThinkingEffort | null {
    const statusEffort = resolveThinkingEffortFromStatusJson(context);
    if (statusEffort !== undefined) {
        return statusEffort;
    }

    return getTranscriptThinkingEffort(context.data?.transcript_path)
        ?? resolveThinkingEffortFromSettings()
        ?? null;
}

function formatEffort(resolved: ResolvedThinkingEffort | null): string {
    if (!resolved) {
        return 'default';
    }
    return resolved.known ? resolved.value : `${resolved.value}?`;
}

export class ThinkingEffortWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Displays the current thinking effort level (low, medium, high, xhigh, max).\nUnknown levels are shown with a trailing "?" (e.g. "super-max?").\nMay be incorrect when multiple Claude Code sessions are running due to current Claude Code limitations.'; }
    getDisplayName(): string { return 'Thinking Effort'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'high' : 'Thinking: high';
        }

        const effort = formatEffort(resolveThinkingEffort(context));
        return item.rawValue ? effort : `Thinking: ${effort}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
