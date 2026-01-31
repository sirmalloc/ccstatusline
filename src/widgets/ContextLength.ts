import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';
import { applyTokenWarning } from '../utils/token-warnings';

export class ContextLengthWidget implements Widget {
    getDefaultColor(): string { return 'brightBlack'; }
    getDescription(): string { return 'Shows the current context window size in tokens'; }
    getDisplayName(): string { return 'Context Length'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '18.6k' : 'Ctx: 18.6k';
        } else if (context.tokenMetrics) {
            const contextLength = context.tokenMetrics.contextLength;
            const formattedLength = formatTokens(contextLength);
            const baseText = item.rawValue ? formattedLength : `Ctx: ${formattedLength}`;

            // Apply threshold-based warnings if configured
            return applyTokenWarning(baseText, contextLength, settings);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}