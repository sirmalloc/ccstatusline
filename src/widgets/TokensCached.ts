import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class TokensCachedWidget implements Widget {
    getDefaultColor(): string {
        return 'cyan';
    }
    getDescription(): string {
        return 'Shows cached token count for the current session';
    }
    getDisplayName(): string {
        return 'Tokens Cached';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? '12k' : 'Cached: 12k';
        } else if (context.tokenMetrics) {
            return item.rawValue
                ? formatTokens(context.tokenMetrics.cachedTokens)
                : `Cached: ${formatTokens(context.tokenMetrics.cachedTokens)}`;
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
