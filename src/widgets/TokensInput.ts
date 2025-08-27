import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class TokensInputWidget implements Widget {
    getDefaultColor(): string {
        return 'blue';
    }
    getDescription(): string {
        return 'Shows input token count for the current session';
    }
    getDisplayName(): string {
        return 'Tokens Input';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? '15.2k' : 'In: 15.2k';
        } else if (context.tokenMetrics) {
            return item.rawValue
                ? formatTokens(context.tokenMetrics.inputTokens)
                : `In: ${formatTokens(context.tokenMetrics.inputTokens)}`;
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
