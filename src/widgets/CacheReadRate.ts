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

import { getCacheTokens } from './shared/cache-metrics';
import {
    CACHE_EMPTY_HIDEABLE_STATE,
    getCacheKeybinds,
    getCacheModifierText,
    handleCacheOptionsAction,
    isCacheSessionScope
} from './shared/cache-scope';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Read Rate: ';

export class CacheReadRateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows cache-read tokens as a percentage of all input tokens'; }
    getDisplayName(): string { return 'Cache Read Rate'; }
    getCategory(): string { return 'Cache'; }
    getLabelPrefix(): string { return LABEL; }

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
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatPercent(64, format));
        }

        const hideWhenEmpty = isHidden(item, CACHE_EMPTY_HIDEABLE_STATE.key);
        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }

        const totalInput = tokens.input + tokens.read + tokens.creation;
        if (totalInput === 0) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), formatPercent(0, format));
        }
        if (tokens.read === 0 && hideWhenEmpty) {
            return null;
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatPercent((tokens.read / totalInput) * 100, format));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getCacheKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
