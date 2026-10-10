// Text in the status line comes from places the user doesn't control: the
// session's directory, git branch and remote names, PR titles, the model and
// output style names, skill names a model chose, and imported settings. Printed
// raw, a terminal reads control sequences in it: an OSC 52 clipboard write, a
// window title, cursor moves or a cleared screen. Only colors and hyperlinks are
// ours to print, so everything else is dropped.

const ESC = '\x1b';
const BEL = '\x07';
const C1_ST = '\x9c';

// Colors and text attributes: ESC [ <digits, ; and :> m
const SGR = /\x1b\[[0-9;:]*m/y;
// A hyperlink: ESC ] 8 ; <parameters> ; <URI> then ESC \ or BEL. The URI may not
// hold control characters or spaces, so it can't end the sequence early or start
// another.
const OSC8 = /\x1b\]8;[A-Za-z0-9=:_.-]*;[^\x00-\x20\x7f-\x9f]*(?:\x1b\\|\x07)/y;
const SAFE_URL = /^[^\x00-\x20\x7f-\x9f]*$/;
// C0 controls other than tab and newline, DEL, and the 8-bit C1 controls, which
// some terminals read like ESC sequences
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;
const CONTROL_GLOBAL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;
// Strings the terminal swallows up to ST: OSC, DCS, SOS, PM and APC
const STRING_INTRODUCERS = new Set([']', 'P', 'X', '^', '_']);

function matchAt(pattern: RegExp, text: string, index: number): string | null {
    pattern.lastIndex = index;
    return pattern.exec(text)?.[0] ?? null;
}

function isCsiParameterOrIntermediate(code: number): boolean {
    return code >= 0x20 && code <= 0x3f;
}

function isIntermediate(code: number): boolean {
    return code >= 0x20 && code <= 0x2f;
}

// Where the escape sequence starting at `index` ends
function skipEscapeSequence(text: string, index: number): number {
    const introducer = text[index + 1];
    if (introducer === undefined) {
        return index + 1;
    }

    if (introducer === '[') {
        let end = index + 2;
        while (end < text.length && isCsiParameterOrIntermediate(text.charCodeAt(end))) {
            end++;
        }
        const final = text.charCodeAt(end);
        return final >= 0x40 && final <= 0x7e ? end + 1 : end;
    }

    if (STRING_INTRODUCERS.has(introducer)) {
        for (let end = index + 2; end < text.length; end++) {
            const char = text[end];
            if (char === BEL || char === C1_ST) {
                return end + 1;
            }
            if (char === ESC) {
                // ESC \ ends the string; any other ESC starts a new sequence
                return text[end + 1] === '\\' ? end + 2 : end;
            }
        }
        return text.length;
    }

    // ESC, intermediate bytes, then a final byte: ESC ( B selects a character
    // set (`tput sgr0` prints it), ESC # 8 fills the screen
    if (isIntermediate(introducer.charCodeAt(0))) {
        let end = index + 2;
        while (end < text.length && isIntermediate(text.charCodeAt(end))) {
            end++;
        }
        const final = text.charCodeAt(end);
        return final >= 0x30 && final <= 0x7e ? end + 1 : end;
    }

    return index + 2;
}

/**
 * The text with every control character and escape sequence removed, except
 * color codes (SGR) and hyperlinks (OSC 8) whose URL holds no control characters or spaces.
 */
export function sanitizeTerminalText(text: string): string {
    if (!CONTROL.test(text)) {
        return text;
    }

    let result = '';
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        if (char === ESC) {
            const kept = matchAt(SGR, text, index) ?? matchAt(OSC8, text, index);
            if (kept) {
                result += kept;
                index += kept.length;
            } else {
                index = skipEscapeSequence(text, index);
            }
            continue;
        }

        let end = index;
        while (end < text.length && text[end] !== ESC) {
            end++;
        }
        result += text.slice(index, end).replace(CONTROL_GLOBAL, '');
        index = end;
    }

    return result;
}

/** Whether a URL can go in a hyperlink as is: no control characters or spaces. */
export function isSafeHyperlinkUrl(url: string): boolean {
    return SAFE_URL.test(url);
}
