import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { loadClaudeSettingsSync } from '../utils/claude-settings';
import { getTranscriptThinkingEffort } from '../utils/jsonl';

export type ThinkingEffortLevel = 'low' | 'medium' | 'high' | 'max';

/**
 * Resolve thinking effort from transcript and settings.
 */
function normalizeThinkingEffort(value: string | undefined): ThinkingEffortLevel | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'max') {
        return normalized;
    }

    return undefined;
}

function resolveThinkingEffortFromSettings(): ThinkingEffortLevel | undefined {
    try {
        const settings = loadClaudeSettingsSync({ logErrors: false });
        return normalizeThinkingEffort(settings.effortLevel);
    } catch {
        // Settings unavailable, return undefined
    }

    return undefined;
}

function resolveThinkingEffort(context: RenderContext): ThinkingEffortLevel {
    return getTranscriptThinkingEffort(context.data?.transcript_path)
        ?? resolveThinkingEffortFromSettings()
        ?? 'medium';
}

const THINKING_EFFORT_DEFAULTS: Record<string, string> = {
    low: 'green',
    medium: 'yellow',
    high: 'brightRed',
    max: 'red'
};

export class ThinkingEffortWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Displays the current thinking effort level (low, medium, high, max).\nMay be incorrect when multiple Claude Code sessions are running due to current Claude Code limitations.'; }
    getDisplayName(): string { return 'Thinking Effort'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getDiscreteValues(): string[] {
        return ['low', 'medium', 'high', 'max'];
    }

    getEffectiveColor(context: RenderContext, item: WidgetItem): string | null {
        if (item.metadata?.colorMode !== 'dynamic') {
            return null;
        }

        const effort = context.isPreview ? 'high' : resolveThinkingEffort(context);

        // Check explicit colorMap entries first
        const mappedColor = item.metadata['colorMap:' + effort];
        if (mappedColor) {
            return mappedColor;
        }

        // Fall back to sensible defaults per level
        return THINKING_EFFORT_DEFAULTS[effort] ?? null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'high' : 'Thinking: high';
        }

        const effort = resolveThinkingEffort(context);
        return item.rawValue ? effort : `Thinking: ${effort}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}