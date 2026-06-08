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
    getCacheTokens,
    getCacheWritePercentage
} from './shared/cache-metrics';
import {
    getCacheScopeKeybind,
    getCacheScopeModifierText,
    handleCacheScopeAction,
    isCacheSessionScope
} from './shared/cache-scope';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class CacheWriteWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows cache write tokens written to cache, with context share'; }
    getDisplayName(): string { return 'Cache Write'; }
    getCategory(): string { return 'Cache'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName(), modifierText: getCacheScopeModifierText(item) };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleCacheScopeAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache Write: ', '3k (16.0%)');
        }

        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return null;
        }

        const value = formatTokensWithPercentage(tokens.creation, getCacheWritePercentage(tokens));
        return formatRawOrLabeledValue(item, 'Cache Write: ', value);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [getCacheScopeKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
