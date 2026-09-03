import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';

import {
    getCacheHitRate,
    getCacheTokens
} from './shared/cache-metrics';
import {
    CACHE_EMPTY_HIDEABLE_STATE,
    getCacheKeybinds,
    getCacheModifierText,
    handleCacheOptionsAction,
    isCacheSessionScope
} from './shared/cache-scope';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class CacheHitRateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows prompt cache hit rate (cache reads vs cache writes)'; }
    getDisplayName(): string { return 'Cache Hit Rate'; }
    getCategory(): string { return 'Cache'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName(), modifierText: getCacheModifierText(item) };
    }

    getHideableStates(): HideableState[] {
        return [CACHE_EMPTY_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleCacheOptionsAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('percent', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache Hit: ', formatPercent(87, format));
        }

        const hideWhenEmpty = isHidden(item, CACHE_EMPTY_HIDEABLE_STATE.key);
        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, 'Cache Hit: ', 'n/a');
        }

        const hitRate = getCacheHitRate(tokens);
        if (hitRate === null) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, 'Cache Hit: ', formatPercent(0, format));
        }

        if (hitRate === 0 && hideWhenEmpty) {
            return null;
        }

        return formatRawOrLabeledValue(item, 'Cache Hit: ', formatPercent(hitRate, format));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getCacheKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
