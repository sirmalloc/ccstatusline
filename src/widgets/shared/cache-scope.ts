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
const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const TOGGLE_CACHE_SCOPE_ACTION = 'toggle-cache-scope';
const TOGGLE_HIDE_EMPTY_ACTION = 'toggle-hide-empty';

const CACHE_SCOPE_KEYBIND: CustomKeybind = { key: 't', label: '(t)urn/session', action: TOGGLE_CACHE_SCOPE_ACTION };
const HIDE_WHEN_EMPTY_KEYBIND: CustomKeybind = {
    key: 'h',
    label: '(h)ide when empty',
    action: TOGGLE_HIDE_EMPTY_ACTION
};

// Cache widgets default to per-turn ("last action") scope. When this flag is
// enabled the widget reports cumulative session totals instead.
export function isCacheSessionScope(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, SCOPE_SESSION_KEY);
}

export function isCacheHideWhenEmptyEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);
}

export function getCacheModifierText(item: WidgetItem): string | undefined {
    const modifiers: string[] = [];
    if (isCacheSessionScope(item)) {
        modifiers.push('session');
    }
    if (isCacheHideWhenEmptyEnabled(item)) {
        modifiers.push('hide when empty');
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

    if (action === TOGGLE_HIDE_EMPTY_ACTION) {
        return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
    }

    return null;
}

export function handleCacheScopeAction(action: string, item: WidgetItem): WidgetItem | null {
    return handleCacheOptionsAction(action, item);
}

export function getCacheKeybinds(): CustomKeybind[] {
    return [CACHE_SCOPE_KEYBIND, HIDE_WHEN_EMPTY_KEYBIND];
}

export function getCacheScopeKeybind(): CustomKeybind {
    return CACHE_SCOPE_KEYBIND;
}
