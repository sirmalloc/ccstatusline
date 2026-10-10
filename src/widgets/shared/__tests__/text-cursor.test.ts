import type { Key } from 'ink';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    applyTextCursorInput,
    renderTextWithCursor
} from '../text-cursor';

function makeKey(overrides: Partial<Key> = {}): Key {
    return {
        upArrow: false,
        downArrow: false,
        leftArrow: false,
        rightArrow: false,
        pageDown: false,
        pageUp: false,
        return: false,
        escape: false,
        ctrl: false,
        shift: false,
        tab: false,
        backspace: false,
        delete: false,
        meta: false,
        ...overrides
    };
}

const FAMILY = '👨‍👩‍👧';

describe('applyTextCursorInput', () => {
    it('inserts at the cursor', () => {
        expect(applyTextCursorInput({ text: 'ac', cursor: 1 }, 'b', makeKey())).toEqual({ text: 'abc', cursor: 2 });
    });

    it('moves and deletes by whole graphemes', () => {
        const text = `a${FAMILY}b`;
        const afterEmoji = 1 + FAMILY.length;

        expect(applyTextCursorInput({ text, cursor: afterEmoji }, '', makeKey({ leftArrow: true }))).toEqual({ text, cursor: 1 });
        expect(applyTextCursorInput({ text, cursor: 1 }, '', makeKey({ rightArrow: true }))).toEqual({ text, cursor: afterEmoji });
        expect(applyTextCursorInput({ text, cursor: afterEmoji }, '', makeKey({ backspace: true }))).toEqual({ text: 'ab', cursor: 1 });
        expect(applyTextCursorInput({ text, cursor: 1 }, '', makeKey({ delete: true }))).toEqual({ text: 'ab', cursor: 1 });
    });

    it('stays put at the edges', () => {
        const start = { text: 'ab', cursor: 0 };
        const end = { text: 'ab', cursor: 2 };

        expect(applyTextCursorInput(start, '', makeKey({ leftArrow: true }))).toEqual(start);
        expect(applyTextCursorInput(start, '', makeKey({ backspace: true }))).toEqual(start);
        expect(applyTextCursorInput(end, '', makeKey({ rightArrow: true }))).toEqual(end);
        expect(applyTextCursorInput(end, '', makeKey({ delete: true }))).toEqual(end);
    });

    it('jumps to the start or end with ctrl+arrows', () => {
        expect(applyTextCursorInput({ text: 'abc', cursor: 1 }, '', makeKey({ ctrl: true, leftArrow: true }))).toEqual({ text: 'abc', cursor: 0 });
        expect(applyTextCursorInput({ text: 'abc', cursor: 1 }, '', makeKey({ ctrl: true, rightArrow: true }))).toEqual({ text: 'abc', cursor: 3 });
    });

    it('leaves non-editing keys to the caller', () => {
        expect(applyTextCursorInput({ text: 'a', cursor: 1 }, '', makeKey({ return: true }))).toBeNull();
        expect(applyTextCursorInput({ text: 'a', cursor: 1 }, '\t', makeKey({ tab: true }))).toBeNull();
    });
});

describe('renderTextWithCursor', () => {
    it('inverts the grapheme under the cursor', () => {
        expect(renderTextWithCursor({ text: `a${FAMILY}`, cursor: 1 })).toBe(`a\x1b[7m${FAMILY}\x1b[27m`);
    });

    it('draws a trailing block when the cursor is at the end', () => {
        expect(renderTextWithCursor({ text: 'ab', cursor: 2 })).toBe('ab\x1b[7m \x1b[27m');
        expect(renderTextWithCursor({ text: '', cursor: 0 })).toBe('\x1b[7m \x1b[27m');
    });
});
