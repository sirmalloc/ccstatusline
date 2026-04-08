import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const HIDE_NO_REMOTE_KEY = 'hideNoRemote';
const TOGGLE_NO_REMOTE_ACTION = 'toggle-no-remote';

const LINK_TO_REPO_KEY = 'linkToRepo';
const TOGGLE_LINK_ACTION = 'toggle-link';

const HIDE_NO_REMOTE_KEYBIND: CustomKeybind = {
    key: 'h',
    label: '(h)ide when no remote',
    action: TOGGLE_NO_REMOTE_ACTION
};

const LINK_TO_REPO_KEYBIND: CustomKeybind = {
    key: 'l',
    label: '(l)ink to repo',
    action: TOGGLE_LINK_ACTION
};

export function isHideNoRemoteEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, HIDE_NO_REMOTE_KEY);
}

export function isLinkToRepoEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, LINK_TO_REPO_KEY);
}

export function getRemoteWidgetModifierText(item: WidgetItem): string | undefined {
    const modifiers: string[] = [];

    if (isHideNoRemoteEnabled(item)) {
        modifiers.push('hide when empty');
    }
    if (isLinkToRepoEnabled(item)) {
        modifiers.push('link');
    }

    return makeModifierText(modifiers);
}

export function handleRemoteWidgetAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action === TOGGLE_NO_REMOTE_ACTION) {
        return toggleMetadataFlag(item, HIDE_NO_REMOTE_KEY);
    }
    if (action === TOGGLE_LINK_ACTION) {
        return toggleMetadataFlag(item, LINK_TO_REPO_KEY);
    }

    return null;
}

export function getRemoteWidgetKeybinds(): CustomKeybind[] {
    return [HIDE_NO_REMOTE_KEYBIND, LINK_TO_REPO_KEYBIND];
}

export function getHideNoRemoteKeybinds(): CustomKeybind[] {
    return [HIDE_NO_REMOTE_KEYBIND];
}