import type {
    CustomKeybind,
    HideableState,
    WidgetItem
} from '../../types/Widget';

import { removeMetadataKeys } from './metadata';

const HIDE_METADATA_KEY = 'hide';
export const EDIT_HIDE_STATES_ACTION = 'edit-hide-states';

const HIDE_KEYBIND: CustomKeybind = {
    key: 'h',
    label: '(h)ide…',
    action: EDIT_HIDE_STATES_ACTION
};

// States shared verbatim by several widgets
export const NO_GIT_HIDEABLE_STATE: HideableState = { key: 'no-git', label: 'when not in a git repo' };
export const NO_JJ_HIDEABLE_STATE: HideableState = { key: 'no-jj', label: 'when not in a jj repo' };
export const NO_REMOTE_HIDEABLE_STATE: HideableState = { key: 'no-remote', label: 'when there is no remote' };
export const NO_UPSTREAM_HIDEABLE_STATE: HideableState = { key: 'no-upstream', label: 'when there is no upstream' };
export const MERGE_TARGET_HIDDEN_HIDEABLE_STATE: HideableState = { key: 'merge-target-hidden', label: 'when merge target is hidden' };

export function parseHideStates(value: string | undefined): string[] {
    if (value === undefined) {
        return [];
    }

    return value
        .split(',')
        .map(key => key.trim())
        .filter(key => key.length > 0);
}

/**
 * Returns whether a hideable state is enabled for an item.
 *
 * The metadata.hide list is authoritative when present; otherwise the
 * widget-declared default applies. Pre-v4 per-widget boolean flags are
 * converted to this key by the v3 -> v4 settings migration.
 */
export function isHidden(item: WidgetItem, key: string, defaultEnabled = false): boolean {
    const hideValue = item.metadata?.[HIDE_METADATA_KEY];
    if (hideValue === undefined) {
        return defaultEnabled;
    }

    return parseHideStates(hideValue).includes(key);
}

export function getEnabledHideStates(item: WidgetItem, states: HideableState[]): string[] {
    return states
        .filter(state => isHidden(item, state.key, state.defaultEnabled ?? false))
        .map(state => state.key);
}

/**
 * Writes the canonical hide list for an item; the hide key is omitted when the
 * enabled set matches the widget's defaults (so untouched items keep minimal
 * metadata).
 */
export function setEnabledHideStates(item: WidgetItem, states: HideableState[], enabledKeys: string[]): WidgetItem {
    const orderedEnabled = states
        .filter(state => enabledKeys.includes(state.key))
        .map(state => state.key);
    const defaults = states
        .filter(state => state.defaultEnabled)
        .map(state => state.key);
    const matchesDefaults = orderedEnabled.length === defaults.length
        && orderedEnabled.every(key => defaults.includes(key));

    const cleaned = removeMetadataKeys(item, [HIDE_METADATA_KEY]);
    if (matchesDefaults) {
        return cleaned;
    }

    return {
        ...cleaned,
        metadata: {
            ...cleaned.metadata,
            [HIDE_METADATA_KEY]: orderedEnabled.join(',')
        }
    };
}

export function getHideKeybind(): CustomKeybind {
    return HIDE_KEYBIND;
}

export function getHideModifierText(item: WidgetItem, states: HideableState[]): string | undefined {
    const enabled = getEnabledHideStates(item, states);
    return enabled.length > 0 ? `(hide: ${enabled.join(', ')})` : undefined;
}
