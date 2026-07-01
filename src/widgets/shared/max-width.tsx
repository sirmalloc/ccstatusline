import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import { truncateStyledText } from '../../utils/ansi';
import { shouldInsertInput } from '../../utils/input-guards';

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

const MaxWidthEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [widthInput, setWidthInput] = useState(widget.maxWidth?.toString() ?? '');

    useInput((input, key) => {
        if (key.return) {
            const width = parseInt(widthInput, 10);
            if (!isNaN(width) && width > 0) {
                onComplete({ ...widget, maxWidth: width });
            } else {
                const { maxWidth, ...rest } = widget;
                void maxWidth; // Intentionally unused
                onComplete(rest);
            }
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setWidthInput(widthInput.slice(0, -1));
        } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
            setWidthInput(widthInput + input);
        }
    });

    return (
        <Box flexDirection='column'>
            <Box>
                <Text>Enter max width (blank for no limit): </Text>
                <Text>{widthInput}</Text>
                <Text backgroundColor='gray' color='black'>{' '}</Text>
            </Box>
            <Text dimColor>Press Enter to save, ESC to cancel</Text>
        </Box>
    );
};
