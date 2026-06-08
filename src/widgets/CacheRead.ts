import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import {
    formatTokensWithPercentage,
    getCacheReadPercentage,
    getCacheTokens
} from './shared/cache-metrics';
import {
    getCacheScopeKeybind,
    getCacheScopeModifierText,
    handleCacheScopeAction,
    isCacheSessionScope
} from './shared/cache-scope';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class CacheReadWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows cache read tokens served from cache, with context share'; }
    getDisplayName(): string { return 'Cache Read'; }
    getCategory(): string { return 'Cache'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName(), modifierText: getCacheScopeModifierText(item) };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleCacheScopeAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache Read: ', '12k (64.0%)');
        }

        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return null;
        }

        const value = formatTokensWithPercentage(tokens.read, getCacheReadPercentage(tokens));
        return formatRawOrLabeledValue(item, 'Cache Read: ', value);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [getCacheScopeKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
