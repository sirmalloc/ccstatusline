import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const HIDE_WHEN_JJ_KEY = 'hideWhenJj';
const TOGGLE_HIDE_WHEN_JJ_ACTION = 'toggle-hide-when-jj';

const HIDE_WHEN_JJ_KEYBIND: CustomKeybind = {
    key: 'j',
    label: 'hide when (j)j present',
    action: TOGGLE_HIDE_WHEN_JJ_ACTION
};

export function isHideWhenJjEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, HIDE_WHEN_JJ_KEY);
}

export function getHideWhenJjModifierText(item: WidgetItem): string[] {
    return isHideWhenJjEnabled(item) ? ['hide when jj'] : [];
}

export function handleToggleHideWhenJjAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action !== TOGGLE_HIDE_WHEN_JJ_ACTION) {
        return null;
    }

    return toggleMetadataFlag(item, HIDE_WHEN_JJ_KEY);
}

export function getHideWhenJjKeybinds(): CustomKeybind[] {
    return [HIDE_WHEN_JJ_KEYBIND];
}