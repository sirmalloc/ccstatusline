import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class ContextLengthWidget implements Widget {
    getDefaultColor(): string {
        return 'brightBlack';
    }
    getDescription(): string {
        return 'Shows the current context window size in tokens';
    }
    getDisplayName(): string {
        return 'Context Length';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? '18.6k' : 'Ctx: 18.6k';
        } else if (context.tokenMetrics) {
            return item.rawValue
                ? formatTokens(context.tokenMetrics.contextLength)
                : `Ctx: ${formatTokens(context.tokenMetrics.contextLength)}`;
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
