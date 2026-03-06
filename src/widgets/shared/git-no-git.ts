import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const HIDE_NO_GIT_KEY = 'hideNoGit';
const TOGGLE_NO_GIT_ACTION = 'toggle-nogit';

const HIDE_NO_GIT_KEYBIND: CustomKeybind = {
    key: 'h',
    label: '(h)ide \'no git\' message',
    action: TOGGLE_NO_GIT_ACTION
};

export function isHideNoGitEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, HIDE_NO_GIT_KEY);
}

export function getHideNoGitModifierText(item: WidgetItem): string | undefined {
    return makeModifierText(isHideNoGitEnabled(item) ? ['hide \'no git\''] : []);
}

export function handleToggleNoGitAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action !== TOGGLE_NO_GIT_ACTION) {
        return null;
    }

    return toggleMetadataFlag(item, HIDE_NO_GIT_KEY);
}

export function getHideNoGitKeybinds(): CustomKeybind[] {
    return [HIDE_NO_GIT_KEYBIND];
}