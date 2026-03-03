import type { WidgetItem } from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

const INVERSE_KEY = 'inverse';
const TOGGLE_INVERSE_ACTION = 'toggle-inverse';

export function isContextInverse(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, INVERSE_KEY);
}

export function getContextInverseModifierText(item: WidgetItem): string | undefined {
    return makeModifierText(isContextInverse(item) ? ['remaining'] : []);
}

export function handleContextInverseAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action !== TOGGLE_INVERSE_ACTION) {
        return null;
    }

    return toggleMetadataFlag(item, INVERSE_KEY);
}