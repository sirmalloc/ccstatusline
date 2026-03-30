import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { fetchMiniMaxQuota } from '../utils/minimax-quota';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class MiniMaxQuotaWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows MiniMax token quota (interval and weekly)'; }
    getDisplayName(): string { return 'MiniMax Quota'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    async renderAsync(item: WidgetItem, context: RenderContext): Promise<string | null> {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, '', '⏎ 3500/4500  ◑ 40000/45000');
        }

        const quota = await fetchMiniMaxQuota();
        if (!quota) {
            return null;
        }

        const intervalText = `${quota.intervalRemaining}/${quota.intervalTotal}`;
        const weeklyText = `${quota.weeklyRemaining}/${quota.weeklyTotal}`;
        
        const displayText = `⏎ ${intervalText}  ◑ ${weeklyText}`;
        return formatRawOrLabeledValue(item, '', displayText);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        // For synchronous rendering, we return a placeholder
        // The async version is called separately for actual data
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, '', '⏎ 3500/4500  ◑ 40000/45000');
        }
        
        // Return loading state - actual rendering happens async
        // This is a limitation of the sync widget interface
        // In practice, the TUI will call renderAsync instead
        return formatRawOrLabeledValue(item, '', '⏎ ...  ◑ ...');
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
