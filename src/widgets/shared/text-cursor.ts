import type { Key } from 'ink';
import {
    useRef,
    useState
} from 'react';

import { shouldInsertInput } from '../../utils/input-guards';

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

// A bar between characters rather than a block over one, so a trailing space
// shows as a gap before it, and the end of the text doesn't look like a space
const CURSOR_BAR = '\x1b[1;36m│\x1b[22;39m';

/** The text with a bar at the cursor. */
export function renderTextWithCursor({ text, cursor }: TextCursorState): string {
    return `${text.slice(0, cursor)}${CURSOR_BAR}${text.slice(cursor)}`;
}

export function useTextCursor(initialText: string) {
    const [state, setState] = useState<TextCursorState>({ text: initialText, cursor: initialText.length });
    const latestState = useRef(state);

    return {
        text: state.text,
        display: renderTextWithCursor(state),
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
