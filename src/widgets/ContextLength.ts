import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowContextLengthTokens } from '../utils/context-window';
import { formatTokens } from '../utils/renderer';

export class ContextLengthWidget implements Widget {
    getDefaultColor(): string { return 'brightBlack'; }
    getDescription(): string { return 'Shows the current context window size in tokens'; }
    getDisplayName(): string { return 'Context Length'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '18.6k' : 'Ctx: 18.6k';
        }

        const contextLengthTokens = getContextWindowContextLengthTokens(context.data);
        if (contextLengthTokens !== null) {
            return item.rawValue ? formatTokens(contextLengthTokens) : `Ctx: ${formatTokens(contextLengthTokens)}`;
        }

        const contextLength = context.tokenMetrics?.contextLength ?? 0;
        return item.rawValue ? formatTokens(contextLength) : `Ctx: ${formatTokens(contextLength)}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}