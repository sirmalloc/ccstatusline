import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { isHidden } from './shared/hideable';
import {
    NO_MISSES_HIDEABLE_STATE,
    getPromptCache,
    hasNoMisses
} from './shared/prompt-cache';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Misses: ';

export class CacheMissesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows prompt cache misses out of the session\'s requests, as Claude Code reports them'; }
    getDisplayName(): string { return 'Cache Misses'; }
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
        if (typeof cache?.misses !== 'number') {
            return null;
        }

        if (hasNoMisses(cache) && isHidden(item, NO_MISSES_HIDEABLE_STATE.key)) {
            return null;
        }

        const value = typeof cache.requests === 'number' ? `${cache.misses}/${cache.requests}` : `${cache.misses}`;
        return formatRawOrLabeledValue(item, LABEL, value);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
