import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class ContextPercentageUsableWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows percentage of usable context window used (of 160k tokens before auto-compact)'; }
    getDisplayName(): string { return 'Context % (usable)'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '11.6%' : 'Ctx(u): 11.6%';
        } else if (context.tokenMetrics) {
            const percentage = Math.min(100, (context.tokenMetrics.contextLength / 160000) * 100);
            return item.rawValue ? `${percentage.toFixed(1)}%` : `Ctx(u): ${percentage.toFixed(1)}%`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}