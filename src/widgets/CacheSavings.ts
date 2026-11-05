import type { NumberFormat } from '../types/NumberFormat';
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
    formatCost,
    resolveNumberFormat
} from '../utils/number-format';

import { getCacheTokens } from './shared/cache-metrics';
import { getPromptCacheSavings } from './shared/cache-savings';
import {
    CACHE_EMPTY_HIDEABLE_STATE,
    getCacheKeybinds,
    getCacheModifierText,
    handleCacheOptionsAction,
    isCacheSessionScope
} from './shared/cache-scope';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Saved: ';

function formatSignedCost(value: number, format: NumberFormat): string {
    const formatted = formatCost(Math.abs(value), format);
    return value < 0 ? `-${formatted}` : formatted;
}

export class CacheSavingsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Estimates prompt-cache savings versus uncached input at standard Claude API rates (5-minute cache writes)'; }
    getDisplayName(): string { return 'Cache Savings'; }
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
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatCost(0.42, format));
        }

        const hideWhenEmpty = isHidden(item, CACHE_EMPTY_HIDEABLE_STATE.key);
        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        const savings = getPromptCacheSavings(context, tokens);
        if (savings === null) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        if (savings === 0 && hideWhenEmpty) {
            return null;
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatSignedCost(savings, format));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getCacheKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
