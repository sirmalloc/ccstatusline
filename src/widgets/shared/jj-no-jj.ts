import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const HIDE_NO_JJ_KEY = 'hideNoJj';
const TOGGLE_NO_JJ_ACTION = 'toggle-nojj';

const HIDE_NO_JJ_KEYBIND: CustomKeybind = {
    key: 'h',
    label: '(h)ide \'no jj\' message',
    action: TOGGLE_NO_JJ_ACTION
};

export function isHideNoJjEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, HIDE_NO_JJ_KEY);
}

export function getHideNoJjModifierText(item: WidgetItem): string | undefined {
    return makeModifierText(isHideNoJjEnabled(item) ? ['hide \'no jj\''] : []);
}

export function handleToggleNoJjAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action !== TOGGLE_NO_JJ_ACTION) {
        return null;
    }

    return toggleMetadataFlag(item, HIDE_NO_JJ_KEY);
}

export function getHideNoJjKeybinds(): CustomKeybind[] {
    return [HIDE_NO_JJ_KEYBIND];
}