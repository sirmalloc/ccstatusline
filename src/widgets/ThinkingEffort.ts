import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { loadClaudeSettings } from '../utils/claude-settings';

export type ThinkingEffortLevel = 'low' | 'medium' | 'high';

/**
 * Resolve thinking effort from StatusJSON or Claude settings.
 * Priority: StatusJSON > Claude settings > undefined
 */
async function resolveThinkingEffort(context: RenderContext): Promise<ThinkingEffortLevel | undefined> {
    // 1. Try StatusJSON (if Claude Code exposes it via status line hook)
    const thinking = context.data?.thinking;
    if (thinking?.effort) {
        return thinking.effort;
    }

    // 2. Fall back to Claude Code settings.json
    try {
        const settings = await loadClaudeSettings({ logErrors: false });
        const raw = settings as Record<string, unknown>;

        // Claude Code uses "thinkingMode" field: "low" | "medium" | "high"
        if (typeof raw.thinkingMode === 'string') {
            const mode = raw.thinkingMode.toLowerCase();
            if (mode === 'low' || mode === 'medium' || mode === 'high') {
                return mode;
            }
        }
    } catch {
        // Settings unavailable, return undefined
    }

    return undefined;
}

export class ThinkingEffortWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Displays the current thinking effort level (low, medium, high)'; }
    getDisplayName(): string { return 'Thinking Effort'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    async render(item: WidgetItem, context: RenderContext, settings: Settings): Promise<string | null> {
        if (context.isPreview) {
            return item.rawValue ? 'high' : 'Thinking: high';
        }

        const effort = await resolveThinkingEffort(context);
        if (!effort) {
            return null;
        }

        return item.rawValue ? effort : `Thinking: ${effort}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
