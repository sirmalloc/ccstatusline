import type { Key } from 'ink';
import {
    useRef,
    useState
} from 'react';

import { shouldInsertInput } from '../../utils/input-guards';

import { useCursorBlink } from './cursor-blink';

// cursor is a string index that always sits on a grapheme boundary, so
// multi-codepoint emoji move and delete as a single character
export interface TextCursorState {
    text: string;
    cursor: number;
}

const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

export function getGraphemes(str: string): string[] {
    if (segmenter) {
        return Array.from(segmenter.segment(str), seg => seg.segment);
    }
    // Fallback to simple character array (won't handle complex emojis perfectly)
    return Array.from(str);
}

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
    const { previous, next } = getAdjacentBoundaries(text, cursor);

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

/**
 * The grapheme boundaries either side of the cursor, undefined past the start
 * or end of the text. For editors that keep their own keys, so they too move,
 * delete and draw the cursor by whole graphemes.
 */
export function getAdjacentBoundaries(text: string, cursor: number): { previous: number | undefined; next: number | undefined } {
    const boundaries = getBoundaries(text);
    const index = boundaries.findIndex(boundary => boundary >= cursor);
    return { previous: boundaries[index - 1], next: boundaries[index + 1] };
}

/** The text with the grapheme under the cursor in inverse video (a trailing block at the end). */
export function renderTextWithCursor({ text, cursor }: TextCursorState, visible = true): string {
    let offset = 0;
    const rendered = getGraphemes(text)
        .map((grapheme) => {
            const underCursor = offset === cursor;
            offset += grapheme.length;
            return underCursor && visible ? `\x1b[7m${grapheme}\x1b[27m` : grapheme;
        })
        .join('');

    return cursor === text.length ? `${rendered}${visible ? '\x1b[7m \x1b[27m' : ' '}` : rendered;
}

export function useTextCursor(initialText: string) {
    const [state, setState] = useState<TextCursorState>({ text: initialText, cursor: initialText.length });
    const latestState = useRef(state);
    const cursorVisible = useCursorBlink();

    return {
        text: state.text,
        display: renderTextWithCursor(state, cursorVisible),
        getText: (): string => latestState.current.text,
        // Returns whether the key was consumed, so callers can fall through
        // to their own bindings
        handleInput: (input: string, key: Key): boolean => {
            const nextState = applyTextCursorInput(latestState.current, input, key);
            if (nextState === null) {
                return false;
            }
            // Publish edits immediately so another key or Save sees them
            // even before React renders the updated text.
            latestState.current = nextState;
            setState(nextState);
            return true;
        }
    };
}
