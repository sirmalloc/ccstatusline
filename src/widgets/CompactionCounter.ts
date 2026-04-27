import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

/**
 * Displays a count of context compaction events in the current session.
 *
 * Claude Code periodically compacts (summarizes) conversation context when it
 * approaches the context window limit. This widget tracks how many times
 * compaction has occurred by detecting drops in used_percentage between renders.
 *
 * Hidden when count is 0. Shows ↻N when compactions have occurred.
 */
export class CompactionCounterWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Count of context compaction events in the current session. Hidden when no compactions have occurred.'; }
    getDisplayName(): string { return 'Compaction Counter'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: 'Compaction Counter' };
    }

    render(_item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return '\u21BB2';
        }

        const count = context.compactionData?.count;
        if (!count)
            return null;

        return `\u21BB${count}`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
