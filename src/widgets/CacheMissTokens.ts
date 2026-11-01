import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/format-tokens';
import { resolveNumberFormat } from '../utils/number-format';

import { isHidden } from './shared/hideable';
import {
    NO_MISSES_HIDEABLE_STATE,
    getPromptCache,
    hasNoMisses
} from './shared/prompt-cache';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Miss recache: ';

export class CacheMissTokensWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows the tokens this session\'s prompt cache misses wrote back to the cache'; }
    getDisplayName(): string { return 'Cache Miss Tokens'; }
    getCategory(): string { return 'Cache'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_MISSES_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const cache = getPromptCache(context);
        if (typeof cache?.miss_recache_tokens !== 'number') {
            return null;
        }

        if (hasNoMisses(cache) && isHidden(item, NO_MISSES_HIDEABLE_STATE.key)) {
            return null;
        }

        const value = formatTokens(cache.miss_recache_tokens, resolveNumberFormat('token', item, settings));
        return formatRawOrLabeledValue(item, LABEL, value);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
