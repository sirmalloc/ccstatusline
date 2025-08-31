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

    // Helper to get grapheme segments if Intl.Segmenter is available
    const getGraphemes = (str: string): string[] => {
        if ('Segmenter' in Intl) {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            return Array.from(segmenter.segment(str), seg => seg.segment);
        }
        // Fallback to simple character array (won't handle complex emojis perfectly)
        return Array.from(str);
    };

    // Convert between grapheme index and string index
    const graphemeToStringIndex = (str: string, graphemeIndex: number): number => {
        const graphemes = getGraphemes(str);
        let stringIndex = 0;
        for (let i = 0; i < Math.min(graphemeIndex, graphemes.length); i++) {
            const grapheme = graphemes[i];
            if (grapheme) {
                stringIndex += grapheme.length;
            }
        }
        return stringIndex;
    };

    const stringToGraphemeIndex = (str: string, stringIndex: number): number => {
        const graphemes = getGraphemes(str);
        let currentStringIndex = 0;
        for (let i = 0; i < graphemes.length; i++) {
            if (currentStringIndex >= stringIndex)
                return i;
            const grapheme = graphemes[i];
            if (grapheme) {
                currentStringIndex += grapheme.length;
            }
        }
        return graphemes.length;
    };

    useInput((input, key) => {
        if (key.return) {
            onComplete({ ...widget, customText: text });
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow) {
            const currentGraphemeIndex = stringToGraphemeIndex(text, cursorPos);
            if (currentGraphemeIndex > 0) {
                const newStringIndex = graphemeToStringIndex(text, currentGraphemeIndex - 1);
                setCursorPos(newStringIndex);
            }
        } else if (key.rightArrow) {
            const currentGraphemeIndex = stringToGraphemeIndex(text, cursorPos);
            const graphemeCount = getGraphemes(text).length;
            if (currentGraphemeIndex < graphemeCount) {
                const newStringIndex = graphemeToStringIndex(text, currentGraphemeIndex + 1);
                setCursorPos(newStringIndex);
            }
        } else if (key.ctrl && input === 'ArrowLeft') {
            setCursorPos(0);
        } else if (key.ctrl && input === 'ArrowRight') {
            setCursorPos(text.length);
        } else if (key.backspace) {
            if (cursorPos > 0) {
                const currentGraphemeIndex = stringToGraphemeIndex(text, cursorPos);
                if (currentGraphemeIndex > 0) {
                    const deleteFromIndex = graphemeToStringIndex(text, currentGraphemeIndex - 1);
                    const deleteToIndex = graphemeToStringIndex(text, currentGraphemeIndex);
                    setText(text.slice(0, deleteFromIndex) + text.slice(deleteToIndex));
                    setCursorPos(deleteFromIndex);
                }
            }
        } else if (key.delete) {
            if (cursorPos < text.length) {
                const currentGraphemeIndex = stringToGraphemeIndex(text, cursorPos);
                const graphemeCount = getGraphemes(text).length;
                if (currentGraphemeIndex < graphemeCount) {
                    const deleteFromIndex = graphemeToStringIndex(text, currentGraphemeIndex);
                    const deleteToIndex = graphemeToStringIndex(text, currentGraphemeIndex + 1);
                    setText(text.slice(0, deleteFromIndex) + text.slice(deleteToIndex));
                }
            }
        } else if (input && !key.ctrl && !key.meta) {
            // Insert the input at cursor position
            const newText = text.slice(0, cursorPos) + input + text.slice(cursorPos);
            setText(newText);

            // Move cursor by the actual string length of the input
            // This handles multi-byte characters including emojis with modifiers
            setCursorPos(cursorPos + input.length);
        }
    });

    // Get the grapheme at cursor position for display
    const graphemes = getGraphemes(text);
    const currentGraphemeIndex = stringToGraphemeIndex(text, cursorPos);

    // Build display with ANSI codes for cursor highlighting
    let display = 'Enter custom text: ';
    for (let i = 0; i < graphemes.length; i++) {
        const grapheme = graphemes[i];
        if (grapheme) {
            if (i === currentGraphemeIndex) {
                // Use inverse video for cursor position
                display += `\x1b[7m${grapheme}\x1b[0m`;
            } else {
                display += grapheme;
            }
        }
    }
    if (currentGraphemeIndex >= graphemes.length) {
        // Cursor at end
        display += '\x1b[7m \x1b[0m';
    }

    return (
        <Box flexDirection='column'>
            <Text>{display}</Text>
            <Text dimColor>←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
        </Box>
    );
};