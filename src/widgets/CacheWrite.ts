import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';

import {
    formatTokensWithPercentage,
    getCacheTokens,
    getCacheWritePercentage
} from './shared/cache-metrics';
import {
    getCacheKeybinds,
    getCacheModifierText,
    handleCacheOptionsAction,
    isCacheHideWhenEmptyEnabled,
    isCacheSessionScope
} from './shared/cache-scope';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class CacheWriteWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows cache write tokens written to cache, with context share'; }
    getDisplayName(): string { return 'Cache Write'; }
    getCategory(): string { return 'Cache'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName(), modifierText: getCacheModifierText(item) };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleCacheOptionsAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache Write: ', '3k (16.0%)');
        }

        const hideWhenEmpty = isCacheHideWhenEmptyEnabled(item);
        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, 'Cache Write: ', 'n/a');
        }

        if (tokens.creation === 0 && hideWhenEmpty) {
            return null;
        }

        const tokenFormat = resolveNumberFormat('token', item, settings);
        const percentFormat = resolveNumberFormat('percent', item, settings);
        const value = formatTokensWithPercentage(tokens.creation, getCacheWritePercentage(tokens), tokenFormat, percentFormat);
        return formatRawOrLabeledValue(item, 'Cache Write: ', value);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getCacheKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
