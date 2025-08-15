import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class TokensCachedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDisplayName(): string { return 'Tokens Cached'; }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '12k' : 'Cached: 12k';
        } else if (context.tokenMetrics) {
            return item.rawValue ? formatTokens(context.tokenMetrics.cachedTokens) : `Cached: ${formatTokens(context.tokenMetrics.cachedTokens)}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
}