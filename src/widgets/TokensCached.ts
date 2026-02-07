import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatWidgetLabel } from '../utils/nerd-font-icons';
import { formatTokens } from '../utils/renderer';

export class TokensCachedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows cached token count for the current session'; }
    getDisplayName(): string { return 'Tokens Cached'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatWidgetLabel('tokens-cached', '12k', 'Cached: ', item.rawValue, settings.nerdFontIcons);
        } else if (context.tokenMetrics) {
            const value = formatTokens(context.tokenMetrics.cachedTokens);
            return formatWidgetLabel('tokens-cached', value, 'Cached: ', item.rawValue, settings.nerdFontIcons);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}