import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

export class CustomTextWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Displays user-defined custom text'; }
    getDisplayName(): string { return 'Custom Text'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const text = item.customText ?? 'Empty';
        return { displayText: `${this.getDisplayName()} (${text})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return item.customText ?? '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{
            key: 'e',
            label: '(e)dit text',
            action: 'edit-text'
        }];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <CustomTextEditor {...props} />;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

const CustomTextEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [text, setText] = useState(widget.customText ?? '');
    const [cursorPos, setCursorPos] = useState(text.length);

    useInput((input, key) => {
        if (key.return) {
            onComplete({ ...widget, customText: text });
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow) {
            setCursorPos(Math.max(0, cursorPos - 1));
        } else if (key.rightArrow) {
            setCursorPos(Math.min(text.length, cursorPos + 1));
        } else if (key.ctrl && input === 'ArrowLeft') {
            setCursorPos(0);
        } else if (key.ctrl && input === 'ArrowRight') {
            setCursorPos(text.length);
        } else if (key.backspace) {
            if (cursorPos > 0) {
                setText(text.slice(0, cursorPos - 1) + text.slice(cursorPos));
                setCursorPos(cursorPos - 1);
            }
        } else if (key.delete) {
            if (cursorPos < text.length) {
                setText(text.slice(0, cursorPos) + text.slice(cursorPos + 1));
            }
        } else if (input && input.length === 1) {
            setText(text.slice(0, cursorPos) + input + text.slice(cursorPos));
            setCursorPos(cursorPos + 1);
        }
    });

    return (
        <Box flexDirection='column'>
            <Text>
                Enter custom text:
                {' '}
                {text.slice(0, cursorPos)}
                <Text backgroundColor='gray' color='black'>{text[cursorPos] ?? ' '}</Text>
                {text.slice(cursorPos + 1)}
            </Text>
            <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
        </Box>
    );
};