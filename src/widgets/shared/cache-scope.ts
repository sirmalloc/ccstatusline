import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const SCOPE_SESSION_KEY = 'cacheScopeSession';
const TOGGLE_CACHE_SCOPE_ACTION = 'toggle-cache-scope';

// Cache widgets default to per-turn ("last action") scope. When this flag is
// enabled the widget reports cumulative session totals instead.
export function isCacheSessionScope(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, SCOPE_SESSION_KEY);
}

export function getCacheScopeModifierText(item: WidgetItem): string | undefined {
    return makeModifierText(isCacheSessionScope(item) ? ['session'] : []);
}

export function handleCacheScopeAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action !== TOGGLE_CACHE_SCOPE_ACTION) {
        return null;
    }

    return toggleMetadataFlag(item, SCOPE_SESSION_KEY);
}

export function getCacheScopeKeybind(): CustomKeybind {
    return { key: 't', label: '(t)urn/session', action: TOGGLE_CACHE_SCOPE_ACTION };
}
