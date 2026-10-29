import type {
    CustomKeybind,
    HideableState,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const SCOPE_SESSION_KEY = 'cacheScopeSession';
const TOGGLE_CACHE_SCOPE_ACTION = 'toggle-cache-scope';

const CACHE_SCOPE_KEYBIND: CustomKeybind = { key: 't', label: '(t)urn/session', action: TOGGLE_CACHE_SCOPE_ACTION };

// Shared hideable state for cache widgets: hide when there is no cache
// activity. Hiding is handled by the unified hideable-state system; the
// per-turn/session scope toggle below is a separate display option.
export const CACHE_EMPTY_HIDEABLE_STATE: HideableState = { key: 'empty', label: 'when there is no cache activity' };

// Cache widgets default to per-turn ("last action") scope. When this flag is
// enabled the widget reports cumulative session totals instead.
export function isCacheSessionScope(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, SCOPE_SESSION_KEY);
}

export function getCacheModifierText(item: WidgetItem): string | undefined {
    const modifiers: string[] = [];
    if (isCacheSessionScope(item)) {
        modifiers.push('session');
    }

    return makeModifierText(modifiers);
}

export function getCacheScopeModifierText(item: WidgetItem): string | undefined {
    return getCacheModifierText(item);
}

export function handleCacheOptionsAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action === TOGGLE_CACHE_SCOPE_ACTION) {
        return toggleMetadataFlag(item, SCOPE_SESSION_KEY);
    }

    return null;
}

export function handleCacheScopeAction(action: string, item: WidgetItem): WidgetItem | null {
    return handleCacheOptionsAction(action, item);
}

export function getCacheKeybinds(): CustomKeybind[] {
    return [CACHE_SCOPE_KEYBIND];
}

export function getCacheScopeKeybind(): CustomKeybind {
    return CACHE_SCOPE_KEYBIND;
}
