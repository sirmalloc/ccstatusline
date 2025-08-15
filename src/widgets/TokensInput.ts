import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class TokensInputWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDisplayName(): string { return 'Tokens Input'; }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '15.2k' : 'In: 15.2k';
        } else if (context.tokenMetrics) {
            return item.rawValue ? formatTokens(context.tokenMetrics.inputTokens) : `In: ${formatTokens(context.tokenMetrics.inputTokens)}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
}