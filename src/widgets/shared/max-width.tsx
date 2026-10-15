import React from 'react';

import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import { truncateStyledText } from '../../utils/ansi';

import { lazyEditor } from './lazy-editor';

export const MAX_WIDTH_ACTION = 'edit-max-width';

const MAX_WIDTH_KEYBIND: CustomKeybind = {
    key: 'w',
    label: '(w)idth',
    action: MAX_WIDTH_ACTION
};

export function getMaxWidthKeybind(): CustomKeybind {
    return MAX_WIDTH_KEYBIND;
}

export function getMaxWidthModifier(item: WidgetItem): string | null {
    return item.maxWidth ? `max:${item.maxWidth}` : null;
}

// Caps a widget's rendered text to maxWidth visible columns, appending an
// ellipsis. ANSI- and OSC8-aware via truncateStyledText, so callers may pass
// already-styled text; for hyperlinked widgets prefer truncating the visible
// label before wrapping so the link target stays intact.
export function applyMaxWidth(text: string, maxWidth: number | undefined): string {
    return maxWidth && maxWidth > 0 ? truncateStyledText(text, maxWidth, { ellipsis: true }) : text;
}

export function renderMaxWidthEditor(props: WidgetEditorProps): React.ReactElement {
    return <MaxWidthEditor {...props} />;
}

const MaxWidthEditor = lazyEditor(() => import('../editors/MaxWidthEditor'));
