import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

export class ContextPercentageWidget implements Widget {
    getDefaultColor(): string {
        return 'blue';
    }
    getDescription(): string {
        return 'Shows percentage of context window used (of 200k tokens)';
    }
    getDisplayName(): string {
        return 'Context %';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? '9.3%' : 'Ctx: 9.3%';
        } else if (context.tokenMetrics) {
            const percentage = Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100);
            return item.rawValue ? `${percentage.toFixed(1)}%` : `Ctx: ${percentage.toFixed(1)}%`;
        }
        return null;
    }

    supportsRawValue(): boolean {
        return true;
    }
    supportsColors(): boolean {
        return true;
    }
}
