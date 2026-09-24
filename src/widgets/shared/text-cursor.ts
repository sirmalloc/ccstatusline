import type { Key } from 'ink';
import { useState } from 'react';

import { shouldInsertInput } from '../../utils/input-guards';

// cursor is a string index that always sits on a grapheme boundary, so
// multi-codepoint emoji move and delete as a single character
export interface TextCursorState {
    text: string;
    cursor: number;
}

function getGraphemes(str: string): string[] {
    if ('Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(segmenter.segment(str), seg => seg.segment);
    }
    // Fallback to simple character array (won't handle complex emojis perfectly)
    return Array.from(str);
}

// String offsets of every grapheme boundary, from 0 through text.length
function getBoundaries(text: string): number[] {
    const boundaries = [0];
    for (const grapheme of getGraphemes(text)) {
        boundaries.push((boundaries[boundaries.length - 1] ?? 0) + grapheme.length);
    }
    return boundaries;
}

/** The state after a keypress, or null when the key is not a text-editing key. */
export function applyTextCursorInput(state: TextCursorState, input: string, key: Key): TextCursorState | null {
    const { text, cursor } = state;
    const boundaries = getBoundaries(text);
    const index = boundaries.findIndex(boundary => boundary >= cursor);
    const previous = boundaries[index - 1];
    const next = boundaries[index + 1];

    if (key.ctrl && key.leftArrow) {
        return { text, cursor: 0 };
    }
    if (key.ctrl && key.rightArrow) {
        return { text, cursor: text.length };
    }
    if (key.leftArrow) {
        return previous === undefined ? state : { text, cursor: previous };
    }
    if (key.rightArrow) {
        return next === undefined ? state : { text, cursor: next };
    }
    if (key.backspace) {
        return previous === undefined
            ? state
            : { text: text.slice(0, previous) + text.slice(cursor), cursor: previous };
    }
    if (key.delete) {
        return next === undefined
            ? state
            : { text: text.slice(0, cursor) + text.slice(next), cursor };
    }
    if (shouldInsertInput(input, key)) {
        return { text: text.slice(0, cursor) + input + text.slice(cursor), cursor: cursor + input.length };
    }
    return null;
}

/** The text with the grapheme under the cursor in inverse video (a trailing block at the end). */
export function renderTextWithCursor({ text, cursor }: TextCursorState): string {
    const boundaries = getBoundaries(text);
    const index = boundaries.findIndex(boundary => boundary >= cursor);
    const graphemes = getGraphemes(text);

    return graphemes
        .map((grapheme, i) => (i === index ? `\x1b[7m${grapheme}\x1b[0m` : grapheme))
        .join('') + (index >= graphemes.length ? '\x1b[7m \x1b[0m' : '');
}

export function useTextCursor(initialText: string) {
    const [state, setState] = useState<TextCursorState>({ text: initialText, cursor: initialText.length });

    return {
        text: state.text,
        display: renderTextWithCursor(state),
        // Replaces the text and moves the cursor to its end
        setText: (text: string) => { setState({ text, cursor: text.length }); },
        // Returns whether the key was consumed, so callers can fall through
        // to their own bindings
        handleInput: (input: string, key: Key): boolean => {
            const next = applyTextCursorInput(state, input, key);
            if (next) {
                setState(next);
            }
            return next !== null;
        }
    };
}
