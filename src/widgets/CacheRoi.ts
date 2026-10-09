import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { renderMagnitude } from '../utils/number-format';

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

const LABEL = 'Cache ROI: ';

export class CacheRoiWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows cache read tokens divided by cache creation tokens'; }
    getDisplayName(): string { return 'Cache ROI'; }
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
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), '4.00x');
        }

        const hideWhenEmpty = isHidden(item, CACHE_EMPTY_HIDEABLE_STATE.key);
        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        if (tokens.read === 0 && tokens.creation === 0 && hideWhenEmpty) {
            return null;
        }

        const value = tokens.creation > 0 ? `${renderMagnitude(tokens.read / tokens.creation, {}, 2)}x` : 'n/a';
        return formatRawOrLabeledValue(item, this.getLabelPrefix(), value);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getCacheKeybinds();
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
